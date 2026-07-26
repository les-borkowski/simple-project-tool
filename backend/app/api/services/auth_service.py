import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.user import UserCreate, UserResponse
from app.auth.permissions import require_not_demo
from app.auth.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_password_reset_token,
)
from app.db.base import LocaleEnum, RoleEnum, ThemeEnum
from app.db.models import User, UserConfig

_logger = logging.getLogger(__name__)

_DUMMY_HASH: str = ""


def _get_dummy_hash() -> str:
    """Lazily initialise the dummy hash on first use to avoid startup cost."""
    global _DUMMY_HASH
    if not _DUMMY_HASH:
        _DUMMY_HASH = hash_password("timing-oracle-prevention-dummy-constant")
    return _DUMMY_HASH


async def register(data: UserCreate, db: AsyncSession) -> UserResponse:
    """Register a new user."""
    # Check for duplicate email
    stmt = select(User).where(User.email == data.email)
    existing = await db.scalar(stmt)
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    # Create user
    user = User(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        role=RoleEnum.manager,
        email_confirmed=False,
    )
    db.add(user)
    await db.flush()  # Get ID

    # Create default config
    config = UserConfig(
        user_id=user.id,
        theme=ThemeEnum.system,
        locale=LocaleEnum.en_gb,
        display_preferences={},
    )
    db.add(config)
    await db.commit()

    return UserResponse.model_validate(user)


async def login(email: str, password: str, db: AsyncSession) -> dict:
    """Authenticate user and return tokens."""
    from datetime import UTC, datetime

    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if not user:
        verify_password(password, _get_dummy_hash())  # constant-time: prevent user enumeration
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.email_confirmed:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_CONFIRMED")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="ACCOUNT_BLOCKED")

    user.last_login = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


async def refresh_token_fn(refresh_token_str: str, db: AsyncSession) -> dict:
    """Exchange a refresh token for a new access token."""
    from app.auth.security import decode_token

    payload = decode_token(refresh_token_str)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="Invalid token type")

    user_id = uuid.UUID(payload["sub"])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.email_confirmed:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_CONFIRMED")
    if user.is_blocked:
        raise HTTPException(status_code=403, detail="ACCOUNT_BLOCKED")

    access_token = create_access_token(user.id, user.role)
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


async def get_me(user: User) -> UserResponse:
    """Return current user info."""
    return UserResponse.model_validate(user)


async def resend_confirmation(email: str, db: AsyncSession, background_tasks) -> None:
    """Resend confirmation email if the account exists and is not yet confirmed."""
    from app.auth.security import create_email_confirmation_token
    from app.core.email import send_confirmation_email

    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if user and not user.email_confirmed:
        token = create_email_confirmation_token(user.id)
        background_tasks.add_task(send_confirmation_email, user.email, user.name, token)


async def request_password_reset(email: str, db: AsyncSession, background_tasks=None) -> None:
    """Create a password reset token and send it via email."""
    from app.core.email import send_password_reset_email

    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if user:
        token = create_password_reset_token(user.id, user.password_changed_at)
        if background_tasks is not None:
            background_tasks.add_task(send_password_reset_email, user.email, user.name, token)


async def confirm_password_reset(token: str, new_password: str, db: AsyncSession) -> None:
    """Verify a password reset token and update the user's password."""
    from datetime import UTC
    from datetime import datetime as dt

    from app.auth.security import decode_token

    payload = decode_token(token)
    if payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token type")
    import uuid as _uuid

    user_id = _uuid.UUID(payload["sub"])
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    # Full verification including single-use check
    verify_password_reset_token(token, user.password_changed_at)
    user.password_hash = hash_password(new_password)
    user.password_changed_at = dt.now(UTC).replace(tzinfo=None)
    await db.commit()


async def change_password(
    current_password: str, new_password: str, user: User, db: AsyncSession
) -> None:
    """Verify current password and replace it with the new one."""
    require_not_demo(user)
    from datetime import UTC
    from datetime import datetime as dt

    if not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(new_password)
    # Bump the change timestamp so any outstanding password-reset tokens are invalidated.
    user.password_changed_at = dt.now(UTC).replace(tzinfo=None)
    await db.commit()


async def confirm_email(token: str, db: AsyncSession) -> None:
    """Mark user email as confirmed using a JWT confirmation token."""
    from app.auth.security import verify_email_confirmation_token

    user_id = verify_email_confirmation_token(token)
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=400, detail="INVALID_TOKEN")
    user.email_confirmed = True
    await db.commit()
