import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import create_password_reset_token, hash_password
from app.db.base import LocaleEnum, RoleEnum, ThemeEnum
from app.db.models import LLMUsageEvent, User, UserConfig


async def get_all_users(db: AsyncSession) -> list[User]:
    result = await db.scalars(select(User).order_by(User.created_at.desc()))
    return list(result.all())


async def create_user(
    db: AsyncSession,
    email: str,
    name: str,
    password: str,
    role: RoleEnum,
) -> User:
    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        email=email,
        name=name,
        password_hash=hash_password(password),
        role=role,
        email_confirmed=True,
    )
    db.add(user)
    await db.flush()

    config = UserConfig(
        user_id=user.id,
        theme=ThemeEnum.system,
        locale=LocaleEnum.en_gb,
        display_preferences={},
    )
    db.add(config)
    await db.commit()
    return user


async def _get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def verify_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    user.email_confirmed = True
    await db.commit()


async def block_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    user.is_blocked = True
    await db.commit()


async def unblock_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    user.is_blocked = False
    await db.commit()


async def enable_demo(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    user.is_demo = True
    await db.commit()


async def disable_demo(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    user.is_demo = False
    await db.commit()


async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    await db.delete(user)
    await db.commit()


async def set_llm_limits(
    db: AsyncSession,
    user_id: uuid.UUID,
    rpm_ceiling: int | None,
    tpm_ceiling: int | None,
) -> None:
    user = await _get_user_or_404(db, user_id)
    user.llm_rpm_ceiling = rpm_ceiling
    user.llm_tpm_ceiling = tpm_ceiling
    await db.commit()


async def get_recent_usage_by_user(db: AsyncSession) -> dict[uuid.UUID, tuple[int, int]]:
    """user_id -> (event_count, total_tokens) in the last 60s, summed across all providers."""
    now = datetime.now(UTC).replace(tzinfo=None)
    window_start = now - timedelta(seconds=60)

    result = await db.execute(
        select(
            LLMUsageEvent.user_id,
            func.count(LLMUsageEvent.id),
            func.coalesce(func.sum(LLMUsageEvent.total_tokens), 0),
        )
        .where(LLMUsageEvent.created_at > window_start)
        .group_by(LLMUsageEvent.user_id)
    )
    return {user_id: (count, tokens) for user_id, count, tokens in result.all()}


async def send_password_reset(db: AsyncSession, user_id: uuid.UUID, background_tasks) -> None:
    from app.core.email import send_password_reset_email

    user = await _get_user_or_404(db, user_id)
    token = create_password_reset_token(user.id, user.password_changed_at)
    background_tasks.add_task(send_password_reset_email, user.email, user.name, token)
