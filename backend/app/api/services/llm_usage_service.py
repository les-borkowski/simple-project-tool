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


async def check_rate_limit(user: User, provider: str, db: AsyncSession) -> None:
    """Raise 429 if the user's rolling 60s usage is at or above their effective limit."""
    row = (
        await db.execute(
            select(UserLLMProvider).where(
                UserLLMProvider.user_id == user.id,
                UserLLMProvider.provider == provider,
            )
        )
    ).scalar_one_or_none()
    rpm = effective_rpm_limit(row, user)
    tpm = effective_tpm_limit(row, user)

    now = _now()
    window_start = now - WINDOW

    result = await db.execute(
        select(
            func.count(LLMUsageEvent.id),
            func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
        ).where(
            LLMUsageEvent.user_id == user.id,
            LLMUsageEvent.provider == provider,
            LLMUsageEvent.created_at > window_start,
        )
    )
    count, tokens = result.one()

    if count >= rpm or tokens >= tpm:
        oldest_created_at = (
            await db.execute(
                select(func.min(LLMUsageEvent.created_at)).where(
                    LLMUsageEvent.user_id == user.id,
                    LLMUsageEvent.provider == provider,
                    LLMUsageEvent.created_at > window_start,
                )
            )
        ).scalar_one()
        if oldest_created_at is None:
            # A 0 limit (fully suspended access) can trip with an empty window —
            # nothing to time out from, so fall back to the full window length.
            retry_after = int(WINDOW.total_seconds())
        else:
            seconds_elapsed = (now - oldest_created_at).total_seconds()
            retry_after = max(1, round(60 - seconds_elapsed))
        raise HTTPException(
            status_code=429,
            detail="LLM_RATE_LIMITED",
            headers={"Retry-After": str(retry_after)},
        )


async def reserve_demo_usage(user: User, provider: str, db: AsyncSession) -> uuid.UUID | None:
    """Enforce the demo cooldown and claim it up front. Returns the row to fill in later.

    Written *before* the LLM call on purpose: a demo request that then times out or
    hits a provider outage has still spent a real call against the server's free-tier
    key, so it has to consume the allowance. Recording only on success would leave
    induced failures unmetered.
    """
    if not user.is_demo:
        return None

    since = _now() - DEMO_CAPTURE_COOLDOWN
    last_used = (
        await db.execute(
            select(func.max(LLMUsageEvent.created_at)).where(
                LLMUsageEvent.user_id == user.id,
                LLMUsageEvent.created_at > since,
            )
        )
    ).scalar_one()

    if last_used is not None:
        elapsed = (_now() - last_used).total_seconds()
        retry_after = max(1, round(DEMO_CAPTURE_COOLDOWN.total_seconds() - elapsed))
        raise HTTPException(
            status_code=429,
            detail="DEMO_CAPTURE_COOLDOWN",
            headers={"Retry-After": str(retry_after)},
        )

    event = LLMUsageEvent(
        user_id=user.id,
        provider=provider,
        total_tokens=0,
        created_at=_now(),
    )
    db.add(event)
    await db.commit()
    return event.id


async def record_usage(
    user: User,
    provider: str,
    total_tokens: int,
    db: AsyncSession,
    event_id: uuid.UUID | None = None,
) -> None:
    """Log one usage event, then opportunistically prune stale rows.

    With *event_id*, fills in a row already claimed by reserve_demo_usage instead of
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
