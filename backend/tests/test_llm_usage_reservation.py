"""The LLM allowance must be claimed before the call, not recorded after it.

`check_rate_limit` reads the window and `record_usage` writes the row that closes it,
with the provider round-trip in between. That leaves two ways to spend an allowance
without paying for it:

  * Concurrency — N simultaneous callers all read the same empty window and all pass.
  * Failure — when the provider call raises, `record_usage` is never reached, so the
    call is never metered at all.

Both matter because `LLM_ALLOW_SERVER_KEY_FALLBACK` means an unmetered call can be
spending the operator's own provider key.
"""

import asyncio
import uuid
from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.services.llm_usage_service import record_usage, reserve_usage
from app.db.models import LLMUsageEvent, User

PROVIDER = "openai"


def make_user(
    *, rpm_ceiling: int | None = None, tpm_ceiling: int | None = None, demo: bool = False
):
    return User(
        email=f"user-{uuid.uuid4().hex[:8]}@example.com",
        name="Test User",
        password_hash="hashed",
        llm_rpm_ceiling=rpm_ceiling,
        llm_tpm_ceiling=tpm_ceiling,
        is_demo=demo,
    )


async def _window_count(db: AsyncSession, user: User) -> int:
    return (
        await db.execute(
            select(func.count(LLMUsageEvent.id)).where(LLMUsageEvent.user_id == user.id)
        )
    ).scalar_one()


async def test_reservation_is_written_before_the_call_for_a_normal_user(api_db: AsyncSession):
    """The row that closes the window must exist before the provider is contacted."""
    user = make_user(rpm_ceiling=5, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    event_id = await reserve_usage(user, PROVIDER, api_db)

    assert event_id is not None, "a normal user's call must be claimed up front"
    assert await _window_count(api_db, user) == 1


async def test_a_failed_provider_call_still_consumes_the_allowance(api_db: AsyncSession):
    """An induced failure must not be a free call.

    Otherwise a caller sends inputs that reliably time out and spends the operator's
    key without limit.
    """
    user = make_user(rpm_ceiling=2, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    # Two calls that both "fail": reserved, never recorded.
    await reserve_usage(user, PROVIDER, api_db)
    await reserve_usage(user, PROVIDER, api_db)

    with pytest.raises(HTTPException) as exc_info:
        await reserve_usage(user, PROVIDER, api_db)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "LLM_RATE_LIMITED"


async def test_rejected_reservation_does_not_leave_a_row_behind(api_db: AsyncSession):
    """A 429 must not itself consume allowance, or the window never reopens."""
    user = make_user(rpm_ceiling=1, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    await reserve_usage(user, PROVIDER, api_db)
    with pytest.raises(HTTPException):
        await reserve_usage(user, PROVIDER, api_db)

    assert await _window_count(api_db, user) == 1, (
        "the rejected attempt left its claim behind, permanently shrinking the window"
    )


async def _reserve_in_own_session(engine, user_id: uuid.UUID, provider: str):
    """One reservation on its own session, the way a real concurrent request gets one.

    A single AsyncSession is not safe to share across coroutines, so a gather() over one
    session tests SQLAlchemy's re-entrancy rather than the rate limiter.
    """
    async with AsyncSession(engine, expire_on_commit=False) as session:
        user = await session.get(User, user_id)
        return await reserve_usage(user, provider, session)


@pytest.fixture
async def committed_user(engine):
    """A user that really exists in the database, so independent sessions can see it."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        user = make_user(rpm_ceiling=2, tpm_ceiling=100_000)
        session.add(user)
        await session.commit()
        user_id = user.id
    yield user_id
    async with AsyncSession(engine) as session:
        await session.execute(delete(LLMUsageEvent).where(LLMUsageEvent.user_id == user_id))
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()


async def test_concurrent_reservations_cannot_all_win(engine, committed_user):
    """The check-then-act gap: N simultaneous callers must not all pass a limit of 2."""
    results = await asyncio.gather(
        *(_reserve_in_own_session(engine, committed_user, PROVIDER) for _ in range(8)),
        return_exceptions=True,
    )

    granted = [r for r in results if not isinstance(r, BaseException)]
    rejected = [r for r in results if isinstance(r, HTTPException)]

    # Exactly 2, not "at most 2": the reservations are serialised, so the outcome is
    # deterministic. A looser bound would also pass if the limiter over-rejected and
    # collapsed to granting one.
    assert len(granted) == 2, (
        f"{len(granted)} of 8 concurrent callers were granted a limit-2 allowance"
    )
    assert len(granted) + len(rejected) == 8, f"unexpected failures: {results}"


async def test_release_usage_hands_back_a_call_that_was_never_made(api_db: AsyncSession):
    """A failure raised before the provider is contacted must not cost allowance.

    Otherwise a server with no key configured burns the caller's whole window on calls
    it never made, and the caller starts getting 429 instead of the 503 that would tell
    them what is actually wrong.
    """
    from app.api.services.llm_usage_service import release_usage

    user = make_user(rpm_ceiling=1, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    event_id = await reserve_usage(user, PROVIDER, api_db)
    await release_usage(event_id, api_db)

    assert await _window_count(api_db, user) == 0
    # And the allowance really is available again.
    assert await reserve_usage(user, PROVIDER, api_db) is not None


async def test_reservation_timestamp_comes_from_the_database_not_the_worker_clock(
    api_db: AsyncSession, monkeypatch
):
    """Window arithmetic must not depend on any worker's local clock.

    Workers drift (NTP outage, VM resume). If a reservation is stamped in Python, a
    skewed worker's rows land outside its peers' windows and each worker ends up
    enforcing the ceiling against only its own skew cluster — the instance then grants
    a multiple of the configured limit.
    """
    from app.api.services import llm_usage_service

    user = make_user(rpm_ceiling=5, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    # A worker whose clock is an hour behind.
    skewed = llm_usage_service._now() - timedelta(hours=1)
    monkeypatch.setattr(llm_usage_service, "_now", lambda: skewed)

    event_id = await reserve_usage(user, PROVIDER, api_db)

    row = await api_db.get(LLMUsageEvent, event_id)
    db_now = (await api_db.execute(select(func.localtimestamp()))).scalar_one()
    assert abs((db_now - row.created_at).total_seconds()) < 60, (
        f"row stamped {row.created_at} against a database clock of {db_now} — the "
        "worker's local clock leaked into the window"
    )


async def test_a_skewed_worker_still_sees_its_peers_usage(api_db: AsyncSession, monkeypatch):
    """The limit must hold even when the caller's own clock is wrong."""
    from app.api.services import llm_usage_service

    user = make_user(rpm_ceiling=2, tpm_ceiling=100_000)
    api_db.add(user)
    await api_db.flush()

    # Two calls from correctly-clocked workers.
    await reserve_usage(user, PROVIDER, api_db)
    await reserve_usage(user, PROVIDER, api_db)

    # A third from a worker an hour behind must still be refused.
    skewed = llm_usage_service._now() - timedelta(hours=1)
    monkeypatch.setattr(llm_usage_service, "_now", lambda: skewed)

    with pytest.raises(HTTPException) as exc_info:
        await reserve_usage(user, PROVIDER, api_db)
    assert exc_info.value.status_code == 429


async def test_record_usage_fills_in_the_reservation_rather_than_adding_a_row(
    api_db: AsyncSession,
):
    user = make_user(rpm_ceiling=5, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    event_id = await reserve_usage(user, PROVIDER, api_db)
    await record_usage(user, PROVIDER, 250, api_db, event_id=event_id)

    assert await _window_count(api_db, user) == 1, "the call was counted twice"
    row = await api_db.get(LLMUsageEvent, event_id)
    assert row.total_tokens == 250


async def test_demo_cooldown_still_applies_on_top_of_the_window(api_db: AsyncSession):
    user = make_user(rpm_ceiling=10, tpm_ceiling=10_000, demo=True)
    api_db.add(user)
    await api_db.flush()

    await reserve_usage(user, PROVIDER, api_db)

    with pytest.raises(HTTPException) as exc_info:
        await reserve_usage(user, PROVIDER, api_db)

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "DEMO_CAPTURE_COOLDOWN"


@pytest.fixture
async def committed_demo_user(engine):
    async with AsyncSession(engine, expire_on_commit=False) as session:
        user = make_user(rpm_ceiling=10, tpm_ceiling=10_000, demo=True)
        session.add(user)
        await session.commit()
        user_id = user.id
    yield user_id
    async with AsyncSession(engine) as session:
        await session.execute(delete(LLMUsageEvent).where(LLMUsageEvent.user_id == user_id))
        await session.execute(delete(User).where(User.id == user_id))
        await session.commit()


async def test_concurrent_demo_reservations_cannot_both_win(engine, committed_demo_user):
    """The demo allowance has the same check-then-act shape and the same fix."""
    results = await asyncio.gather(
        *(_reserve_in_own_session(engine, committed_demo_user, PROVIDER) for _ in range(4)),
        return_exceptions=True,
    )

    granted = [r for r in results if not isinstance(r, BaseException)]
    assert len(granted) == 1, f"{len(granted)} concurrent demo captures were granted"
