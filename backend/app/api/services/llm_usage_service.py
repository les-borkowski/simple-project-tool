"""Postgres-backed rolling-window rate limiting for LLM calls (T13).

Must not be in-process: the deployment runs multiple workers, and an
in-memory window would under-count by exactly the worker count.
"""

import random
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import LLMUsageEvent, User, UserLLMProvider
from app.db.models.user_llm_provider import effective_rpm_limit, effective_tpm_limit

WINDOW = timedelta(seconds=60)

# Demo accounts always spend the server's own (free-tier) provider key: they can never
# hold a credential of their own, because upsert_provider is require_not_demo-guarded.
# So they get a far coarser allowance than the per-minute window above.
DEMO_CAPTURE_COOLDOWN = timedelta(hours=2)

# Piggyback stale-row pruning on a small fraction of writes — no scheduler.
PRUNE_PROBABILITY = 0.01

# Usage rows are the demo cooldown's only evidence, so they must outlive the cooldown.
PRUNE_AFTER = DEMO_CAPTURE_COOLDOWN + timedelta(hours=1)


def _now() -> datetime:
    # created_at is a naive column (see app/db/base.py's _utcnow); compare naive-to-naive.
    return datetime.now(UTC).replace(tzinfo=None)


async def _effective_limits(user: User, provider: str, db: AsyncSession) -> tuple[int, int]:
    row = (
        await db.execute(
            select(UserLLMProvider).where(
                UserLLMProvider.user_id == user.id,
                UserLLMProvider.provider == provider,
            )
        )
    ).scalar_one_or_none()
    return effective_rpm_limit(row, user), effective_tpm_limit(row, user)


async def _retry_after_seconds(user: User, provider: str, now: datetime, db: AsyncSession) -> int:
    oldest_created_at = (
        await db.execute(
            select(func.min(LLMUsageEvent.created_at)).where(
                LLMUsageEvent.user_id == user.id,
                LLMUsageEvent.provider == provider,
                LLMUsageEvent.created_at > now - WINDOW,
            )
        )
    ).scalar_one()
    if oldest_created_at is None:
        # A 0 limit (fully suspended access) can trip with an empty window —
        # nothing to time out from, so fall back to the full window length.
        return int(WINDOW.total_seconds())
    seconds_elapsed = (now - oldest_created_at).total_seconds()
    return max(1, round(WINDOW.total_seconds() - seconds_elapsed))


async def check_rate_limit(user: User, provider: str, db: AsyncSession) -> None:
    """Raise 429 if the user's rolling 60s usage is at or above their effective limit.

    Read-only. Callers that are about to *spend* an allowance must use reserve_usage
    instead — checking and then spending leaves a gap that concurrent callers walk
    straight through.
    """
    rpm, tpm = await _effective_limits(user, provider, db)
    now = _now()

    count, tokens = (
        await db.execute(
            select(
                func.count(LLMUsageEvent.id),
                func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
            ).where(
                LLMUsageEvent.user_id == user.id,
                LLMUsageEvent.provider == provider,
                LLMUsageEvent.created_at > now - WINDOW,
            )
        )
    ).one()

    if count >= rpm or tokens >= tpm:
        raise HTTPException(
            status_code=429,
            detail="LLM_RATE_LIMITED",
            headers={"Retry-After": str(await _retry_after_seconds(user, provider, now, db))},
        )


async def _lock_user(user: User, db: AsyncSession) -> None:
    """Serialise every reservation for one user against the others.

    Transaction-scoped, so it is released by the commit or rollback that ends this
    reservation. Holding it across the count *and* the insert is what makes them one
    atomic decision — the alternative (insert first, then rank rows by timestamp) is
    wrong, because a row's timestamp order and its commit-visibility order are
    independent: two callers can each commit after stamping and each fail to see the
    other, and both are then granted.
    """
    await db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(str(user.id), 0))))


async def _db_now(db: AsyncSession) -> datetime:
    """The database's clock, as a naive timestamp.

    Every window comparison uses this rather than the worker's own clock. `created_at`
    is filled by the column's `server_default=now()`, so a worker whose clock has
    drifted cannot place its rows outside its peers' windows — which would let each
    worker enforce the ceiling against only its own skew cluster.

    localtimestamp is now()::timestamp, matching exactly what the server_default writes
    into this naive column.
    """
    return (await db.execute(select(func.localtimestamp()))).scalar_one()


async def reserve_usage(user: User, provider: str, db: AsyncSession) -> uuid.UUID:
    """Claim one call against the user's allowance *before* it is spent.

    Claiming up front is what makes a failed call still count: the reservation stays
    behind with total_tokens=0 when the provider raises, instead of the call going
    unmetered because record_usage was never reached.

    Returns the row id for record_usage to fill in. Raises 429 if the allowance is gone.
    """
    await _lock_user(user, db)
    now = await _db_now(db)

    try:
        if user.is_demo:
            await _enforce_demo_cooldown(user, now, db)
        await _enforce_window_limits(user, provider, now, db)
    except HTTPException:
        # End the transaction to release the lock. Commit rather than rollback: nothing
        # has been written yet so there is nothing to undo, and rollback expires every
        # loaded object regardless of expire_on_commit — the caller's `user` included,
        # so the next attribute read would attempt IO from wherever the 429 surfaces.
        await db.commit()
        raise

    # created_at is deliberately not passed: the column's server_default stamps it with
    # the database's clock, the same clock every window comparison above reads from.
    event = LLMUsageEvent(user_id=user.id, provider=provider, total_tokens=0)
    db.add(event)
    await db.commit()  # releases the advisory lock
    return event.id


async def release_usage(event_id: uuid.UUID, db: AsyncSession) -> None:
    """Hand back a reservation for a call that was never actually made.

    Only for failures raised *before* any provider request goes out — a configuration
    error, say. A call that reached the provider and then failed has still been spent
    and must keep its reservation.
    """
    await db.execute(delete(LLMUsageEvent).where(LLMUsageEvent.id == event_id))
    await db.commit()


async def _enforce_demo_cooldown(user: User, now: datetime, db: AsyncSession) -> None:
    """Demo accounts always spend the server's own free-tier key, so they get one call
    every DEMO_CAPTURE_COOLDOWN across all providers rather than a per-minute window."""
    last_used = (
        await db.execute(
            select(func.max(LLMUsageEvent.created_at)).where(
                LLMUsageEvent.user_id == user.id,
                LLMUsageEvent.created_at > now - DEMO_CAPTURE_COOLDOWN,
            )
        )
    ).scalar_one()

    if last_used is None:
        return

    elapsed = (now - last_used).total_seconds()
    raise HTTPException(
        status_code=429,
        detail="DEMO_CAPTURE_COOLDOWN",
        headers={
            "Retry-After": str(max(1, round(DEMO_CAPTURE_COOLDOWN.total_seconds() - elapsed)))
        },
    )


async def _enforce_window_limits(
    user: User, provider: str, now: datetime, db: AsyncSession
) -> None:
    rpm, tpm = await _effective_limits(user, provider, db)

    count, tokens = (
        await db.execute(
            select(
                func.count(LLMUsageEvent.id),
                func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
            ).where(
                LLMUsageEvent.user_id == user.id,
                LLMUsageEvent.provider == provider,
                LLMUsageEvent.created_at > now - WINDOW,
            )
        )
    ).one()

    if count >= rpm or tokens >= tpm:
        raise HTTPException(
            status_code=429,
            detail="LLM_RATE_LIMITED",
            headers={"Retry-After": str(await _retry_after_seconds(user, provider, now, db))},
        )


async def record_usage(
    user: User,
    provider: str,
    total_tokens: int,
    db: AsyncSession,
    event_id: uuid.UUID | None = None,
) -> None:
    """Log one usage event, then opportunistically prune stale rows.

    With *event_id*, fills in a row already claimed by reserve_usage instead of
    inserting a second one — the reservation is the same call, just counted early.
    """
    if event_id is not None:
        await db.execute(
            update(LLMUsageEvent)
            .where(LLMUsageEvent.id == event_id)
            .values(total_tokens=total_tokens)
        )
    else:
        db.add(
            LLMUsageEvent(
                user_id=user.id,
                provider=provider,
                total_tokens=total_tokens,
                created_at=_now(),
            )
        )
    await db.commit()

    if random.random() < PRUNE_PROBABILITY:
        await prune_usage_events(db)


async def prune_usage_events(db: AsyncSession, older_than: timedelta = PRUNE_AFTER) -> int:
    """Delete usage rows older than *older_than*. Returns the number of rows deleted."""
    cutoff = _now() - older_than
    result = await db.execute(delete(LLMUsageEvent).where(LLMUsageEvent.created_at < cutoff))
    await db.commit()
    return result.rowcount
