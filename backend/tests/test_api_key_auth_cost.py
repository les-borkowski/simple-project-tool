"""The API-key auth path must not stall the event loop or amplify on bogus keys.

`require_scope` now guards ~24 agent-facing routes, and an MCP agent turn issues
several API-keyed calls, so every millisecond spent in this path is multiplied. Two
distinct hazards:

  * bcrypt at 12 rounds is ~250ms of CPU. Run directly in an `async def` it blocks the
    *whole worker*, not just the caller — unrelated requests stall behind it.
  * A key matching no prefix falls through to the legacy `key_prefix = ''` bucket and
    is bcrypt-checked against every legacy row, so one unauthenticated request costs
    N hashes.
"""

import asyncio
import secrets
import uuid

import bcrypt
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models.api_key import APIKey
from app.db.models.user import User


async def _make_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"keycost_{uuid.uuid4().hex[:8]}@example.com",
        name="Key Cost User",
        password_hash="irrelevant",
        role=RoleEnum.contributor,
        email_confirmed=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _count_hashes(db: AsyncSession, candidate: str, monkeypatch):
    """Run a lookup while counting real bcrypt.checkpw invocations.

    monkeypatch (rather than direct assignment) so the patch is scoped and unwound by
    pytest — `dependencies.bcrypt` *is* the bcrypt module, so this is process-wide.
    """
    from app.auth import dependencies

    calls = 0
    real_checkpw = bcrypt.checkpw

    def counting_checkpw(password: bytes, hashed: bytes) -> bool:
        nonlocal calls
        calls += 1
        return real_checkpw(password, hashed)

    monkeypatch.setattr("bcrypt.checkpw", counting_checkpw)
    found = await dependencies._find_api_key(db, candidate)
    return calls, found


async def _add_legacy_key(db: AsyncSession, user: User) -> str:
    raw = secrets.token_urlsafe(32)
    db.add(
        APIKey(
            user_id=user.id,
            key_hash=bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=4)).decode(),
            key_prefix="",
            label="legacy",
            scopes=["read:tasks"],
        )
    )
    await db.flush()
    return raw


@pytest.mark.asyncio
async def test_api_key_check_does_not_block_the_event_loop(api_db: AsyncSession):
    """A slow hash check must not prevent other coroutines from running.

    Uses a deliberately expensive bcrypt cost so the block is unmistakable, then runs a
    heartbeat coroutine alongside the lookup. If checkpw runs on the loop the heartbeat
    is frozen for the whole check and ticks ~once; off the loop it keeps ticking.
    """
    from app.auth.dependencies import _find_api_key

    user = await _make_user(api_db)
    raw = secrets.token_urlsafe(32)
    api_db.add(
        APIKey(
            user_id=user.id,
            # rounds=12 matches production and takes ~250ms — long enough that a
            # blocked loop is unambiguous rather than a timing coin-flip.
            key_hash=bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=12)).decode(),
            key_prefix=raw[:8],
            label="expensive",
            scopes=["read:tasks"],
        )
    )
    await api_db.flush()

    ticks = 0

    async def heartbeat() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.005)
            ticks += 1

    beat = asyncio.create_task(heartbeat())
    try:
        found = await _find_api_key(api_db, raw)
    finally:
        beat.cancel()

    assert found is not None, "the key should still authenticate"
    assert ticks > 5, (
        f"event loop only ticked {ticks} times during the hash check — bcrypt is "
        "running on the loop and stalling every other request in the worker"
    )


@pytest.mark.asyncio
async def test_bogus_key_does_not_hash_against_every_legacy_row(api_db: AsyncSession, monkeypatch):
    """An unauthenticated bogus key must cost a bounded number of hash checks.

    Otherwise `X-API-Key: x` at any rate multiplies by the legacy-key count, with no
    credential and no rate limit in front of it.
    """
    user = await _make_user(api_db)
    for _ in range(5):
        await _add_legacy_key(api_db, user)

    calls, found = await _count_hashes(api_db, "definitely-not-a-real-key", monkeypatch)

    assert found is None
    assert calls == 0, (
        f"a bogus key triggered {calls} bcrypt checks against the legacy bucket; "
        "each one is ~250ms of CPU an unauthenticated caller can spend for free"
    )


@pytest.mark.asyncio
async def test_wellformed_wrong_key_costs_hashes_while_the_legacy_bucket_is_on(
    api_db: AsyncSession, monkeypatch
):
    """Documents the residual cost the setting exists to close.

    The shape filter stops malformed spam for free, but a caller who sends a correctly
    shaped 43-char key still reaches the legacy scan while the fallback is enabled. That
    is the known, bounded trade-off of keeping pre-migration keys working.
    """
    from app.core.config import settings

    user = await _make_user(api_db)
    for _ in range(5):
        await _add_legacy_key(api_db, user)

    monkeypatch.setattr(settings, "API_KEY_LEGACY_PREFIX_FALLBACK", True)
    calls, found = await _count_hashes(api_db, secrets.token_urlsafe(32), monkeypatch)

    assert found is None
    assert calls == 5, f"expected one hash per legacy row, got {calls}"


async def test_turning_the_legacy_bucket_off_removes_that_cost_entirely(
    api_db: AsyncSession, monkeypatch
):
    from app.core.config import settings

    user = await _make_user(api_db)
    for _ in range(5):
        await _add_legacy_key(api_db, user)

    monkeypatch.setattr(settings, "API_KEY_LEGACY_PREFIX_FALLBACK", False)
    calls, found = await _count_hashes(api_db, secrets.token_urlsafe(32), monkeypatch)

    assert found is None
    assert calls == 0, (
        f"with the legacy bucket off a wrong key cost {calls} hashes; it should cost none"
    )


def test_shape_filter_accepts_every_key_the_generator_produces():
    """The pre-filter must be a fact about the generator, never a heuristic.

    A false negative here is a user's working API key silently starting to 401.
    """
    from app.auth.security import generate_api_key, looks_like_api_key

    # Bind to the real generator, which is the thing the filter makes a claim about.
    # generate_api_key bcrypts at rounds=12, so a couple of calls is all that is
    # affordable — the bulk of the sampling uses the same token source it draws from.
    for _ in range(2):
        raw_key, _hash, _prefix = generate_api_key()
        assert looks_like_api_key(raw_key), (
            f"generator produced a key the filter rejects: {raw_key!r}"
        )

    # 500 samples of the underlying token source catches alphabet edge cases (a token
    # happening to end in '-' or '_', for instance) that two draws would miss.
    for _ in range(500):
        assert looks_like_api_key(secrets.token_urlsafe(32))


@pytest.mark.parametrize(
    ("candidate", "why"),
    [
        ("", "empty"),
        ("x", "far too short"),
        ("definitely-not-a-real-key", "too short"),
        ("a" * 42, "one character short"),
        ("a" * 44, "one character long"),
        ("a" * 42 + "!", "right length, character outside the urlsafe alphabet"),
        ("a" * 42 + " ", "right length, trailing space"),
        ("a" * 42 + "\n", "right length, trailing newline"),
    ],
)
def test_shape_filter_rejects_things_no_key_can_be(candidate, why):
    from app.auth.security import looks_like_api_key

    assert not looks_like_api_key(candidate), f"should have been rejected: {why}"


@pytest.mark.asyncio
async def test_legacy_key_still_authenticates_when_the_fallback_is_enabled(
    api_db: AsyncSession, monkeypatch
):
    """Closing the amplification must not silently invalidate real legacy keys."""
    from app.auth import dependencies
    from app.core.config import settings

    monkeypatch.setattr(settings, "API_KEY_LEGACY_PREFIX_FALLBACK", True)

    user = await _make_user(api_db)
    raw = await _add_legacy_key(api_db, user)

    found = await dependencies._find_api_key(api_db, raw)

    assert found is not None
    assert found.user_id == user.id


@pytest.mark.asyncio
async def test_legacy_fallback_can_be_turned_off_once_keys_are_rotated(
    api_db: AsyncSession, monkeypatch
):
    from app.auth import dependencies
    from app.core.config import settings

    monkeypatch.setattr(settings, "API_KEY_LEGACY_PREFIX_FALLBACK", False)

    user = await _make_user(api_db)
    raw = await _add_legacy_key(api_db, user)

    assert await dependencies._find_api_key(api_db, raw) is None


@pytest.mark.asyncio
async def test_current_keys_are_unaffected_by_the_legacy_switch(api_db: AsyncSession, monkeypatch):
    from app.auth import dependencies
    from app.core.config import settings

    monkeypatch.setattr(settings, "API_KEY_LEGACY_PREFIX_FALLBACK", False)

    user = await _make_user(api_db)
    raw = secrets.token_urlsafe(32)
    api_db.add(
        APIKey(
            user_id=user.id,
            key_hash=bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=4)).decode(),
            key_prefix=raw[:8],
            label="current",
            scopes=["read:tasks"],
        )
    )
    await api_db.flush()

    found = await dependencies._find_api_key(api_db, raw)

    assert found is not None
    assert found.user_id == user.id
