"""API keys expire.

This branch is the one that hands API keys to third-party LLM hosts — SPT_API_KEY sits
in a Claude Desktop or Claude Code config file on the user's machine. A key leaked from
there was previously valid forever, until someone noticed and revoked it.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models import APIKey, User


def _naive_utc() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _user_with_key(db: AsyncSession, *, expires_at: datetime | None) -> str:
    user = User(
        id=uuid.uuid4(),
        email=f"expiry_{uuid.uuid4().hex[:8]}@example.com",
        name="Expiry User",
        password_hash="irrelevant",
        role=RoleEnum.contributor,
        email_confirmed=True,
    )
    db.add(user)
    await db.flush()

    raw = secrets.token_urlsafe(32)
    db.add(
        APIKey(
            user_id=user.id,
            key_hash=bcrypt.hashpw(raw.encode(), bcrypt.gensalt(rounds=4)).decode(),
            key_prefix=raw[:8],
            label="test",
            scopes=["read:tasks"],
            expires_at=expires_at,
        )
    )
    await db.flush()
    return raw


async def test_an_expired_key_does_not_authenticate(api_db: AsyncSession):
    from app.auth.dependencies import _find_api_key

    raw = await _user_with_key(api_db, expires_at=_naive_utc() - timedelta(seconds=1))

    assert await _find_api_key(api_db, raw) is None


async def test_an_unexpired_key_still_authenticates(api_db: AsyncSession):
    from app.auth.dependencies import _find_api_key

    raw = await _user_with_key(api_db, expires_at=_naive_utc() + timedelta(days=1))

    assert await _find_api_key(api_db, raw) is not None


async def test_a_key_with_no_expiry_still_authenticates(api_db: AsyncSession):
    """Existing rows predate the column and must keep working."""
    from app.auth.dependencies import _find_api_key

    raw = await _user_with_key(api_db, expires_at=None)

    assert await _find_api_key(api_db, raw) is not None


class TestNewKeysGetADefaultLifetime:
    async def test_created_key_expires(self, api_client: AsyncClient, auth_headers: dict):
        resp = await api_client.post(
            "/api/v1/config/api-keys",
            json={"label": "agent", "scopes": ["read:tasks"]},
            headers=auth_headers,
        )
        assert resp.status_code == 201
        assert resp.json()["expires_at"] is not None

    async def test_expiry_is_surfaced_when_listing(
        self, api_client: AsyncClient, auth_headers: dict
    ):
        await api_client.post(
            "/api/v1/config/api-keys",
            json={"label": "agent", "scopes": ["read:tasks"]},
            headers=auth_headers,
        )
        resp = await api_client.get("/api/v1/config/api-keys", headers=auth_headers)

        assert resp.status_code == 200
        assert all("expires_at" in k for k in resp.json())

    async def test_caller_can_choose_a_shorter_lifetime(
        self, api_client: AsyncClient, auth_headers: dict
    ):
        resp = await api_client.post(
            "/api/v1/config/api-keys",
            json={"label": "short", "scopes": ["read:tasks"], "expires_in_days": 7},
            headers=auth_headers,
        )
        assert resp.status_code == 201

        expires_at = datetime.fromisoformat(resp.json()["expires_at"])
        delta = expires_at.replace(tzinfo=None) - _naive_utc()
        assert timedelta(days=6) < delta < timedelta(days=8)

    @pytest.mark.parametrize("bad", [0, -1, 3651])
    async def test_absurd_lifetimes_are_rejected(
        self, api_client: AsyncClient, auth_headers: dict, bad: int
    ):
        resp = await api_client.post(
            "/api/v1/config/api-keys",
            json={"label": "bad", "scopes": ["read:tasks"], "expires_in_days": bad},
            headers=auth_headers,
        )
        assert resp.status_code == 422
