"""Integration tests for app.auth.dependencies using a minimal FastAPI TestClient app."""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import bcrypt
import jwt
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    get_current_user,
    get_current_user_or_api_key,
    optional_auth,
    require_scope,
)
from app.core.config import settings
from app.db.base import RoleEnum
from app.db.database import get_db

# ---------------------------------------------------------------------------
# Minimal FastAPI app wired up for testing
# ---------------------------------------------------------------------------

app = FastAPI()


@app.get("/me")
async def me_route(user=Depends(get_current_user)):
    return {"user_id": str(user.id)}


@app.get("/me-or-key")
async def me_or_key_route(user=Depends(get_current_user_or_api_key)):
    return {"user_id": str(user.id)}


@app.get("/optional")
async def optional_route(user=Depends(optional_auth)):
    if user is None:
        return {"user_id": None}
    return {"user_id": str(user.id)}


@app.get("/scoped")
async def scoped_route(user=Depends(require_scope("read:projects"))):
    return {"user_id": str(user.id)}


client = TestClient(app, raise_server_exceptions=False)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_access_token(user_id=None, role=RoleEnum.contributor):
    """Create a valid access token and return (user_id, token)."""
    uid = user_id or uuid.uuid4()
    payload = {
        "sub": str(uid),
        "role": role.value,
        "type": "access",
        "exp": datetime.now(UTC) + timedelta(minutes=15),
    }
    return uid, jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def make_refresh_token(user_id=None):
    """Create a refresh token and return (user_id, token)."""
    uid = user_id or uuid.uuid4()
    payload = {
        "sub": str(uid),
        "type": "refresh",
        "exp": datetime.now(UTC) + timedelta(days=7),
    }
    return uid, jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def make_expired_token(user_id=None):
    """Create an expired access token and return (user_id, token)."""
    uid = user_id or uuid.uuid4()
    payload = {
        "sub": str(uid),
        "type": "access",
        "exp": datetime.now(UTC) - timedelta(seconds=10),
    }
    return uid, jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def make_mock_db(user=None):
    """Return a mock AsyncSession that yields the given user from db.get()."""
    mock_db = AsyncMock()
    mock_db.get.return_value = user
    return mock_db


def db_override(mock_db):
    """Build an async generator dependency override for get_db."""

    async def _override():
        yield mock_db

    return _override


# ---------------------------------------------------------------------------
# Tests: get_current_user
# ---------------------------------------------------------------------------


def test_get_current_user_valid_token():
    """Scenario 1: valid Bearer token returns user with 200."""
    user_id, token = make_access_token()
    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.is_blocked = False

    mock_db = make_mock_db(user=mock_user)
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_no_token():
    """Scenario 2: missing Bearer token returns 401."""
    mock_db = make_mock_db()
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_expired_token():
    """Scenario 3: expired token returns 401."""
    _, token = make_expired_token()
    mock_db = make_mock_db()
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_refresh_token_rejected():
    """Scenario 4: refresh token (wrong type) returns 401."""
    _, token = make_refresh_token()
    mock_db = make_mock_db()
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_user_not_in_db():
    """Scenario 5: valid token but user not found in DB returns 401."""
    _, token = make_access_token()
    mock_db = make_mock_db(user=None)  # db.get returns None
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests: get_current_user_or_api_key
# ---------------------------------------------------------------------------


def test_get_current_user_or_api_key_valid_bearer():
    """Scenario 6: valid Bearer token returns user."""
    user_id, token = make_access_token()
    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.is_blocked = False

    mock_db = make_mock_db(user=mock_user)
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me-or-key", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_or_api_key_valid_api_key():
    """Scenario 7: valid X-API-Key returns user and sets request.state.api_key."""
    user_id = uuid.uuid4()
    raw_key = "test-raw-api-key-value"
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt(rounds=4)).decode()

    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.is_blocked = False

    mock_api_key = MagicMock()
    mock_api_key.key_hash = key_hash
    mock_api_key.user_id = user_id
    mock_api_key.revoked_at = None

    # db.scalars(...).all() returns a list with the mock api key
    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [mock_api_key]

    mock_db = AsyncMock()
    mock_db.scalars = AsyncMock(return_value=mock_scalars_result)
    mock_db.get.return_value = mock_user

    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me-or-key", headers={"X-API-Key": raw_key})
        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(user_id)
        # Verify last_used_at was set (best-effort update)
        assert mock_api_key.last_used_at is not None
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_or_api_key_no_auth():
    """Scenario 8: no auth at all returns 401."""
    mock_db = make_mock_db()
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/me-or-key")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests: optional_auth
# ---------------------------------------------------------------------------


def test_optional_auth_valid_token():
    """Scenario 9: valid token returns user with 200."""
    user_id, token = make_access_token()
    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.is_blocked = False

    mock_db = make_mock_db(user=mock_user)
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/optional", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()


def test_optional_auth_no_token():
    """Scenario 10: no token returns None (200, not 401)."""
    mock_db = make_mock_db()
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/optional")
        assert resp.status_code == 200
        assert resp.json()["user_id"] is None
    finally:
        app.dependency_overrides.clear()


def test_optional_auth_invalid_token():
    """Scenario 11: invalid token returns None (200, not 401)."""
    mock_db = make_mock_db()
    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/optional", headers={"Authorization": "Bearer not.a.valid.token"})
        assert resp.status_code == 200
        assert resp.json()["user_id"] is None
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Tests: require_scope
# ---------------------------------------------------------------------------


def test_require_scope_api_key_with_scope_passes():
    """Scenario 12: API key with required scope passes (200)."""
    user_id = uuid.uuid4()
    raw_key = "scoped-api-key-value"
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt(rounds=4)).decode()

    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.is_blocked = False

    mock_api_key = MagicMock()
    mock_api_key.key_hash = key_hash
    mock_api_key.user_id = user_id
    mock_api_key.revoked_at = None
    mock_api_key.scopes = ["read:projects"]

    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [mock_api_key]

    mock_db = AsyncMock()
    mock_db.scalars = AsyncMock(return_value=mock_scalars_result)
    mock_db.get.return_value = mock_user

    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/scoped", headers={"X-API-Key": raw_key})
        assert resp.status_code == 200
        assert resp.json()["user_id"] == str(user_id)
    finally:
        app.dependency_overrides.clear()


def test_get_current_user_or_api_key_deleted_user_raises_401():
    """Valid non-revoked API key but the associated user no longer exists → 401."""
    raw_key = secrets.token_urlsafe(32)
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt(rounds=4)).decode()

    mock_api_key = MagicMock()
    mock_api_key.key_hash = key_hash
    mock_api_key.user_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_db.scalars.return_value = MagicMock(all=MagicMock(return_value=[mock_api_key]))
    mock_db.get.return_value = None  # user deleted

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        resp = client.get("/me-or-key", headers={"X-API-Key": raw_key})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_require_scope_api_key_missing_scope_returns_403():
    """Scenario 13: API key missing required scope returns 403."""
    user_id = uuid.uuid4()
    raw_key = "no-scope-api-key-value"
    key_hash = bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt(rounds=4)).decode()

    mock_user = MagicMock()
    mock_user.id = user_id
    mock_user.is_blocked = False

    mock_api_key = MagicMock()
    mock_api_key.key_hash = key_hash
    mock_api_key.user_id = user_id
    mock_api_key.revoked_at = None
    mock_api_key.scopes = []  # no scopes at all

    mock_scalars_result = MagicMock()
    mock_scalars_result.all.return_value = [mock_api_key]

    mock_db = AsyncMock()
    mock_db.scalars = AsyncMock(return_value=mock_scalars_result)
    mock_db.get.return_value = mock_user

    app.dependency_overrides[get_db] = db_override(mock_db)
    try:
        resp = client.get("/scoped", headers={"X-API-Key": raw_key})
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
