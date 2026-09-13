"""Tests for the Postgres-backed LLM rate-limit service (T13).

Each test runs inside a savepoint-backed transaction (`api_db`), so
`record_usage`/`prune_usage_events` calling `db.commit()` never leaks
state between tests.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.services.llm_usage_service import (
    DEMO_CAPTURE_COOLDOWN,
    check_rate_limit,
    prune_usage_events,
    record_usage,
    reserve_usage,
)
from app.db.models import LLMUsageEvent, User

PROVIDER = "openai"


def make_user(*, rpm_ceiling: int | None = None, tpm_ceiling: int | None = None) -> User:
    return User(
        email=f"user-{uuid.uuid4().hex[:8]}@example.com",
        name="Test User",
        password_hash="hashed",
        llm_rpm_ceiling=rpm_ceiling,
        llm_tpm_ceiling=tpm_ceiling,
    )


async def add_events(
    db: AsyncSession, user: User, count: int, *, tokens: int = 10, age_seconds: float = 0
) -> None:
    """Insert *count* usage rows, `age_seconds` in the past (0 = now)."""
    created_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=age_seconds)
    for _ in range(count):
        db.add(
            LLMUsageEvent(
                user_id=user.id,
                provider=PROVIDER,
                total_tokens=tokens,
                created_at=created_at,
            )
        )
    await db.flush()


async def test_under_limit_passes(api_db: AsyncSession):
    user = make_user(rpm_ceiling=5, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=3)

    await check_rate_limit(user, PROVIDER, api_db)


async def test_nth_call_hits_effective_rpm(api_db: AsyncSession):
    user = make_user(rpm_ceiling=3, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=3)

    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "LLM_RATE_LIMITED"
    assert "Retry-After" in exc_info.value.headers


async def test_events_older_than_window_dont_count(api_db: AsyncSession):
    user = make_user(rpm_ceiling=1, tpm_ceiling=1000)
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=5, age_seconds=61)

    await check_rate_limit(user, PROVIDER, api_db)


async def test_tpm_trips_independently_of_rpm(api_db: AsyncSession):
    """A handful of huge-token calls trips TPM well under the RPM ceiling."""
    user = make_user(rpm_ceiling=100, tpm_ceiling=500)
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=2, tokens=300)

    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.detail == "LLM_RATE_LIMITED"


async def test_rpm_trips_independently_of_tpm(api_db: AsyncSession):
    """Many low-token calls trip RPM well under the TPM ceiling."""
    user = make_user(rpm_ceiling=3, tpm_ceiling=1_000_000)
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=3, tokens=1)

    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.detail == "LLM_RATE_LIMITED"


async def test_lower_per_credential_limit_honored(api_db: AsyncSession):
    from app.db.models import UserLLMProvider

    user = make_user(rpm_ceiling=20, tpm_ceiling=100_000)
    api_db.add(user)
    await api_db.flush()

    provider_row = UserLLMProvider(
        user_id=user.id,
        provider=PROVIDER,
        api_key_encrypted="enc",
        api_key_hint="abcd1234",
        rpm_limit=2,
    )
    api_db.add(provider_row)
    await api_db.flush()

    await add_events(api_db, user, count=2)

    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.detail == "LLM_RATE_LIMITED"


async def test_per_credential_limit_above_ceiling_is_clamped(api_db: AsyncSession):
    from app.db.models import UserLLMProvider

    user = make_user(rpm_ceiling=3, tpm_ceiling=100_000)
    api_db.add(user)
    await api_db.flush()

    provider_row = UserLLMProvider(
        user_id=user.id,
        provider=PROVIDER,
        api_key_encrypted="enc",
        api_key_hint="abcd1234",
        rpm_limit=1000,
    )
    api_db.add(provider_row)
    await api_db.flush()

    # 2 events is under the clamped ceiling of 3 — must not raise.
    await add_events(api_db, user, count=2)
    await check_rate_limit(user, PROVIDER, api_db)

    # A 3rd event reaches the clamped ceiling.
    await add_events(api_db, user, count=1)
    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.detail == "LLM_RATE_LIMITED"


async def test_admin_ceiling_overrides_default_when_no_credential_row(api_db: AsyncSession):
    """No UserLLMProvider row exists, so the user's admin ceiling replaces settings.LLM_MAX_RPM."""
    user = make_user(rpm_ceiling=2, tpm_ceiling=100_000)
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=2)

    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.detail == "LLM_RATE_LIMITED"


async def test_zero_ceiling_with_no_events_raises_cleanly(api_db: AsyncSession):
    """A 0 RPM ceiling (fully suspended access) trips with an empty window —
    must not crash doing arithmetic on a NULL oldest-event timestamp."""
    user = make_user(rpm_ceiling=0, tpm_ceiling=100_000)
    api_db.add(user)
    await api_db.flush()

    with pytest.raises(HTTPException) as exc_info:
        await check_rate_limit(user, PROVIDER, api_db)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "LLM_RATE_LIMITED"
    assert exc_info.value.headers["Retry-After"] == "60"


async def test_record_usage_inserts_row(api_db: AsyncSession):
    user = make_user(rpm_ceiling=10, tpm_ceiling=10_000)
    api_db.add(user)
    await api_db.flush()

    await record_usage(user, PROVIDER, 42, api_db)

    rows = (
        (await api_db.execute(select(LLMUsageEvent).where(LLMUsageEvent.user_id == user.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].total_tokens == 42
    assert rows[0].provider == PROVIDER


async def test_prune_usage_events_removes_only_old_rows(api_db: AsyncSession):
    user = make_user()
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=2, age_seconds=timedelta(hours=2).total_seconds())
    await add_events(api_db, user, count=3, age_seconds=10)

    deleted = await prune_usage_events(api_db, older_than=timedelta(hours=1))
    assert deleted == 2

    remaining = (
        (await api_db.execute(select(LLMUsageEvent).where(LLMUsageEvent.user_id == user.id)))
        .scalars()
        .all()
    )
    assert len(remaining) == 3


# --- Demo cooldown (one capture per DEMO_CAPTURE_COOLDOWN) ---


def make_demo_user() -> User:
    user = make_user()
    user.is_demo = True
    return user


async def test_reserve_usage_claims_a_row_for_normal_users_too(api_db: AsyncSession):
    """Reservation used to be demo-only, which is what left the general path racy and
    left failed calls unmetered. Every caller now claims before spending."""
    user = make_user()
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=3)

    event_id = await reserve_usage(user, PROVIDER, api_db)
    assert event_id is not None

    rows = (
        (await api_db.execute(select(LLMUsageEvent).where(LLMUsageEvent.user_id == user.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 4  # the three existing events plus this claim
    assert next(r for r in rows if r.id == event_id).total_tokens == 0


async def test_first_demo_capture_claims_a_row_before_the_llm_call(api_db: AsyncSession):
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    event_id = await reserve_usage(user, PROVIDER, api_db)
    assert event_id is not None

    row = (
        await api_db.execute(select(LLMUsageEvent).where(LLMUsageEvent.id == event_id))
    ).scalar_one()
    assert row.total_tokens == 0  # filled in later by record_usage


async def test_second_demo_capture_within_cooldown_is_rejected(api_db: AsyncSession):
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    await reserve_usage(user, PROVIDER, api_db)

    with pytest.raises(HTTPException) as exc_info:
        await reserve_usage(user, PROVIDER, api_db)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "DEMO_CAPTURE_COOLDOWN"
    retry_after = int(exc_info.value.headers["Retry-After"])
    assert 0 < retry_after <= DEMO_CAPTURE_COOLDOWN.total_seconds()


async def test_demo_capture_allowed_again_after_cooldown(api_db: AsyncSession):
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    stale = DEMO_CAPTURE_COOLDOWN.total_seconds() + 60
    await add_events(api_db, user, count=1, age_seconds=stale)

    assert await reserve_usage(user, PROVIDER, api_db) is not None


async def test_demo_cooldown_counts_a_failed_call(api_db: AsyncSession):
    """The reservation survives an LLM call that never reports usage."""
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    await reserve_usage(user, PROVIDER, api_db)
    # ...extract() raises here, so record_usage is never reached...

    with pytest.raises(HTTPException) as exc_info:
        await reserve_usage(user, PROVIDER, api_db)
    assert exc_info.value.detail == "DEMO_CAPTURE_COOLDOWN"


async def test_demo_cooldown_spans_providers(api_db: AsyncSession):
    """Switching provider must not hand a demo account a second allowance."""
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    await reserve_usage(user, "google", api_db)

    with pytest.raises(HTTPException):
        await reserve_usage(user, "anthropic", api_db)


async def test_record_usage_fills_in_the_reserved_row(api_db: AsyncSession):
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    event_id = await reserve_usage(user, PROVIDER, api_db)
    await record_usage(user, PROVIDER, 350, api_db, event_id=event_id)

    rows = (
        (await api_db.execute(select(LLMUsageEvent).where(LLMUsageEvent.user_id == user.id)))
        .scalars()
        .all()
    )
    assert len(rows) == 1  # updated in place, not a second insert
    assert rows[0].total_tokens == 350


async def test_default_prune_keeps_rows_the_demo_cooldown_still_needs(api_db: AsyncSession):
    """Pruning must not silently reset a demo account's cooldown."""
    user = make_demo_user()
    api_db.add(user)
    await api_db.flush()

    await add_events(api_db, user, count=1, age_seconds=timedelta(hours=1.5).total_seconds())

    await prune_usage_events(api_db)

    with pytest.raises(HTTPException) as exc_info:
        await reserve_usage(user, PROVIDER, api_db)
    assert exc_info.value.detail == "DEMO_CAPTURE_COOLDOWN"
