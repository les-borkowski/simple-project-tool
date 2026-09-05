from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID

import bcrypt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import check_scope, decode_token
from app.db.database import get_db

if TYPE_CHECKING:
    from app.db.models.api_key import APIKey
    from app.db.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Skip the last_used_at write (and its commit) if the key was already used recently.
LAST_USED_THROTTLE = timedelta(minutes=5)


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
    if user.is_blocked:
        raise HTTPException(403, "ACCOUNT_BLOCKED")
    return user


async def _find_api_key(db: AsyncSession, api_key_header: str) -> "APIKey | None":
    """Look up the APIKey matching the raw header, bcrypt-checking one bucket at a time."""
    from sqlalchemy import select

    from app.auth.security import PREFIX_LENGTH
    from app.db.models.api_key import APIKey

    # Second pass matches rows created before the prefix migration (server_default='');
    # it only runs when the indexed prefix lookup found no match, so the happy path
    # costs a single bcrypt check.  Remove it once all legacy keys are rotated.
    for candidate_prefix in (api_key_header[:PREFIX_LENGTH], ""):
        stmt = select(APIKey).where(
            APIKey.key_prefix == candidate_prefix,
            APIKey.revoked_at.is_(None),
        )
        candidates = (await db.scalars(stmt)).all()
        for key_record in candidates:
            if bcrypt.checkpw(api_key_header.encode(), key_record.key_hash.encode()):
                return key_record
    return None


async def _touch_last_used(db: AsyncSession, key_id: UUID, now: datetime) -> None:
    """Stamp last_used_at, repeating the throttle in the WHERE clause.

    Concurrent requests on one key all read the same stale value, so the condition has to
    live in the UPDATE itself — that is the atomicity boundary that collapses the writes.
    """
    from sqlalchemy import or_, update

    from app.db.models.api_key import APIKey

    await db.execute(
        update(APIKey)
        .where(
            APIKey.id == key_id,
            or_(
                APIKey.last_used_at.is_(None),
                APIKey.last_used_at < now - LAST_USED_THROTTLE,
            ),
        )
        .values(last_used_at=now)
        .execution_options(synchronize_session=False)
    )
    await db.commit()


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
        from app.db.models.user import User

        key_record = await _find_api_key(db, api_key_header)
        if key_record:
            request.state.api_key = key_record
            # last_used_at is a naive column, so compare naive-to-naive.
            now = datetime.now(UTC).replace(tzinfo=None)
            if (
                key_record.last_used_at is None
                or key_record.last_used_at < now - LAST_USED_THROTTLE
            ):
                await _touch_last_used(db, key_record.id, now)
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
            raise HTTPException(403, "INSUFFICIENT_SCOPE")
        return user

    return check
