import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.api_key import APIKeyCreate, APIKeyCreatedResponse, APIKeyResponse
from app.api.schemas.config import UserConfigResponse, UserConfigUpdate
from app.auth.security import generate_api_key
from app.db.models import APIKey, User, UserConfig


async def get_config(user: User, db: AsyncSession) -> UserConfigResponse:
    """Get current user's configuration."""
    config = await db.get(UserConfig, user.id)
    if not config:
        # Create default config if missing
        config = UserConfig(
            user_id=user.id,
            theme="system",
            locale="en-GB",
            display_preferences={},
        )
        db.add(config)
        await db.commit()

    return UserConfigResponse.model_validate(config)


async def update_config(data: UserConfigUpdate, user: User, db: AsyncSession) -> UserConfigResponse:
    """Update current user's configuration."""
    config = await db.get(UserConfig, user.id)
    if not config:
        config = UserConfig(user_id=user.id)
        db.add(config)
        await db.flush()

    if data.theme is not None:
        config.theme = data.theme
    if data.locale is not None:
        config.locale = data.locale
    if data.display_preferences is not None:
        config.display_preferences = data.display_preferences

    await db.commit()
    return UserConfigResponse.model_validate(config)


async def list_api_keys(user: User, db: AsyncSession) -> list[APIKeyResponse]:
    """List API keys for the current user."""
    stmt = select(APIKey).where(
        APIKey.user_id == user.id,
        APIKey.revoked_at.is_(None),
    ).order_by(APIKey.created_at.desc())
    keys = (await db.scalars(stmt)).all()
    return [APIKeyResponse.model_validate(k) for k in keys]


async def create_api_key(data: APIKeyCreate, user: User, db: AsyncSession) -> APIKeyCreatedResponse:
    """Create a new API key."""
    raw_key, key_hash, key_prefix = generate_api_key()

    key = APIKey(
        user_id=user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label=data.label,
        scopes=data.scopes,
    )
    db.add(key)
    await db.commit()

    return APIKeyCreatedResponse(
        id=key.id,
        label=key.label,
        scopes=key.scopes,
        key=raw_key,
    )


async def revoke_api_key(key_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Revoke an API key."""
    key = await db.get(APIKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    if key.user_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot revoke others' API keys")

    key.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
