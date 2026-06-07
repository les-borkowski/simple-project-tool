from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

import bcrypt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import check_scope, decode_token
from app.db.database import get_db

if TYPE_CHECKING:
    from app.db.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> "User":
    """Validate a Bearer JWT and return the authenticated User."""
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(token)  # raises 401 on invalid/expired
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    user_id = UUID(payload["sub"])
    from app.db.models.user import User

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def get_current_user_or_api_key(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> "User":
    """Authenticate via Bearer JWT or X-API-Key header."""
    # 1. Try Bearer JWT first
    if token:
        return await get_current_user(token=token, db=db)

    # 2. Try X-API-Key header
    api_key_header = request.headers.get("X-API-Key")
    if api_key_header:
        from sqlalchemy import or_, select

        from app.auth.security import PREFIX_LENGTH
        from app.db.models.api_key import APIKey
        from app.db.models.user import User

        prefix = api_key_header[:PREFIX_LENGTH]
        # Also match key_prefix='' to support rows created before the prefix migration
        # (server_default='').  Remove this fallback once all legacy keys are rotated.
        stmt = select(APIKey).where(
            or_(APIKey.key_prefix == prefix, APIKey.key_prefix == ""),
            APIKey.revoked_at.is_(None),
        )
        candidates = (await db.scalars(stmt)).all()
        for key_record in candidates:
            if bcrypt.checkpw(api_key_header.encode(), key_record.key_hash.encode()):
                key_record.last_used_at = datetime.now(UTC)
                request.state.api_key = key_record
                user = await db.get(User, key_record.user_id)
                if not user:
                    raise HTTPException(status_code=401, detail="User not found")
                return user

    raise HTTPException(401, "Not authenticated")


async def optional_auth(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> "User | None":
    """Return the current user if authenticated, or None if not (no error)."""
    if not token:
        return None
    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


def require_scope(scope: str):
    """Returns a FastAPI dependency that enforces a specific scope for API key requests."""

    async def check(
        request: Request, user: "User" = Depends(get_current_user_or_api_key)
    ) -> "User":
        api_key = getattr(request.state, "api_key", None)
        if api_key and not check_scope(api_key, scope):
            raise HTTPException(403, f"API key missing scope: {scope}")
        return user

    return check
