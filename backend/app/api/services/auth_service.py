import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    verify_password_reset_token,
)
from app.db.models import User, UserConfig
from app.db.base import RoleEnum, ThemeEnum, LocaleEnum
from app.api.schemas.user import UserCreate, UserResponse, UserUpdate


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
        role=RoleEnum.contributor,
    )
    db.add(user)
    await db.flush()  # Get ID

    # Create default config
    config = UserConfig(
        user_id=user.id,
        theme=ThemeEnum.system,
        locale=LocaleEnum.en_GB,
        display_preferences={},
    )
    db.add(config)
    await db.commit()

    return UserResponse.model_validate(user)


async def login(email: str, password: str, db: AsyncSession) -> dict:
    """Authenticate user and return tokens."""
    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

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

    access_token = create_access_token(user.id, user.role)
    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


async def get_me(user: User) -> UserResponse:
    """Return current user info."""
    return UserResponse.model_validate(user)


async def request_password_reset(email: str, db: AsyncSession) -> str:
    """Create a password reset token. Returns the token (email sending not implemented)."""
    stmt = select(User).where(User.email == email)
    user = await db.scalar(stmt)

    if not user:
        # Don't reveal whether email exists
        return "reset_token_sent"

    token = create_password_reset_token(user.id)
    # TODO: send token via email; for now just return it
    return token


async def confirm_password_reset(token: str, new_password: str, db: AsyncSession) -> None:
    """Verify a password reset token and update the user's password."""
    user_id = verify_password_reset_token(token)
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    user.password_hash = hash_password(new_password)
    await db.commit()
