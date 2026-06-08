import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import create_password_reset_token, hash_password
from app.db.base import LocaleEnum, RoleEnum, ThemeEnum
from app.db.models import User, UserConfig


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


async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    user = await _get_user_or_404(db, user_id)
    await db.delete(user)
    await db.commit()


async def send_password_reset(db: AsyncSession, user_id: uuid.UUID) -> None:
    from app.core.email import send_password_reset_email

    user = await _get_user_or_404(db, user_id)
    token = create_password_reset_token(user.id, user.password_changed_at)
    await send_password_reset_email(user.email, user.name, token)
