"""Integration tests for app.auth.dependencies using a minimal FastAPI TestClient app."""

import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import bcrypt
import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.main import app as main_app
from app.auth.dependencies import (
    LAST_USED_THROTTLE,
    get_current_user,
    get_current_user_or_api_key,
    optional_auth,
    require_scope,
)
from app.core.config import settings
from app.core.llm import get_llm_client
from app.core.llm.base import LLMResponse
from app.db.base import RoleEnum
from app.db.database import get_db
from app.db.models import APIKey

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
    mock_api_key.last_used_at = None

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
        # last_used_at is stamped by a conditional UPDATE, not by mutating the instance
        assert mock_db.execute.await_count == 1
        assert mock_db.commit.await_count == 1
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
    mock_api_key.last_used_at = None
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
    mock_api_key.last_used_at = None

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
    mock_api_key.last_used_at = None
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


# ---------------------------------------------------------------------------
# Tests: last_used_at durability on read-only routes (real app + real DB)
# ---------------------------------------------------------------------------


class _FakeLLMClient:
    """Minimal stub returning a single valid extraction response."""

    async def complete(self, system, user, *, json_schema=None, max_tokens, temperature):
        text = json.dumps(
            {
                "tasks": [
                    {
                        "title": "Fix the login bug",
                        "description": None,
                        "story_hint": None,
                        "assignee_hint": None,
                        "due_date": None,
                        "priority": None,
                        "confidence": 0.9,
                    }
                ],
                "not_a_task": False,
                "notes": None,
            }
        )
        return LLMResponse(
            text=text, model="gemini-3.6-flash", prompt_tokens=1, completion_tokens=1, latency_ms=1
        )


@pytest.mark.asyncio
async def test_api_key_last_used_at_persists_after_readonly_capture_route(
    api_client: AsyncClient, manager_headers: dict, api_db: AsyncSession, test_project: dict
):
    """The capture preview endpoint never commits itself; get_current_user_or_api_key
    must commit its own last_used_at update or it's silently lost (rolled back).
    """
    create_resp = await api_client.post(
        "/api/v1/config/api-keys",
        json={"label": "test", "scopes": ["write:tasks"]},
        headers=manager_headers,
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    raw_key = created["key"]
    key_id = created["id"]

    key_before = await api_db.get(APIKey, uuid.UUID(key_id))
    assert key_before.last_used_at is None

    main_app.dependency_overrides[get_llm_client] = lambda: _FakeLLMClient()
    try:
        capture_resp = await api_client.post(
            f"/api/v1/projects/{test_project['id']}/tasks/capture",
            json={"text": "Fix the login bug"},
            headers={"X-API-Key": raw_key},
        )
        assert capture_resp.status_code == 200
    finally:
        main_app.dependency_overrides.pop(get_llm_client, None)

    key_after = await api_db.get(APIKey, uuid.UUID(key_id), populate_existing=True)
    assert key_after.last_used_at is not None


# ---------------------------------------------------------------------------
# Tests: prefix lookup, last_used_at throttling and scope error code
# (real app + real DB)
# ---------------------------------------------------------------------------


async def _mint_api_key(
    api_client: AsyncClient, headers: dict, scopes: list[str], label: str = "test key"
) -> tuple[str, uuid.UUID]:
    """Create an API key via the config route. Returns (raw_key, key_id)."""
    resp = await api_client.post(
        "/api/v1/config/api-keys",
        json={"label": label, "scopes": scopes},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    return data["key"], uuid.UUID(data["id"])


async def _make_legacy(api_db: AsyncSession, key_id: uuid.UUID) -> None:
    """Blank out key_prefix, the state left by the prefix migration's server_default."""
    key = await api_db.get(APIKey, key_id)
    key.key_prefix = ""
    await api_db.flush()


async def _confirm_task(api_client: AsyncClient, project_id: str, raw_key: str, title: str):
    """Call the scope-gated confirm route (no LLM involved) with an API key."""
    return await api_client.post(
        f"/api/v1/projects/{project_id}/tasks/capture/confirm",
        json={"tasks": [{"title": title}]},
        headers={"X-API-Key": raw_key},
    )


@pytest.mark.asyncio
async def test_known_prefix_key_does_one_bcrypt(
    api_client: AsyncClient, manager_headers: dict, api_db: AsyncSession, test_project: dict
):
    """A key with a real prefix is found in the first pass, so only its own hash is checked."""
    # The legacy row is seeded first so a single-query lookup would hash-check it first.
    _, legacy_id = await _mint_api_key(api_client, manager_headers, ["write:tasks"], "legacy")
    await _make_legacy(api_db, legacy_id)
    raw_key, _ = await _mint_api_key(api_client, manager_headers, ["write:tasks"], "prefixed")

    with patch("app.auth.dependencies.bcrypt.checkpw", wraps=bcrypt.checkpw) as spy:
        resp = await _confirm_task(api_client, test_project["id"], raw_key, "Prefixed key task")

    assert resp.status_code == 201
    assert spy.call_count == 1


@pytest.mark.asyncio
async def test_legacy_prefix_key_still_authenticates(
    api_client: AsyncClient, manager_headers: dict, api_db: AsyncSession, test_project: dict
):
    """A key_prefix='' row is found by the second pass and authenticates."""
    raw_key, key_id = await _mint_api_key(api_client, manager_headers, ["write:tasks"], "legacy")
    await _make_legacy(api_db, key_id)

    resp = await _confirm_task(api_client, test_project["id"], raw_key, "Legacy key task")

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_last_used_at_throttled(
    api_client: AsyncClient, manager_headers: dict, api_db: AsyncSession, test_project: dict
):
    """A second request inside the throttle window leaves last_used_at untouched."""
    raw_key, key_id = await _mint_api_key(api_client, manager_headers, ["write:tasks"])

    first = await _confirm_task(api_client, test_project["id"], raw_key, "First task")
    assert first.status_code == 201
    after_first = (await api_db.get(APIKey, key_id, populate_existing=True)).last_used_at
    assert after_first is not None

    second = await _confirm_task(api_client, test_project["id"], raw_key, "Second task")
    assert second.status_code == 201
    after_second = (await api_db.get(APIKey, key_id, populate_existing=True)).last_used_at

    assert after_second == after_first


@pytest.mark.asyncio
async def test_last_used_at_updates_after_window(
    api_client: AsyncClient, manager_headers: dict, api_db: AsyncSession, test_project: dict
):
    """A key last used beyond the throttle window gets a fresh last_used_at."""
    raw_key, key_id = await _mint_api_key(api_client, manager_headers, ["write:tasks"])

    stale = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=10)
    key = await api_db.get(APIKey, key_id)
    key.last_used_at = stale
    await api_db.flush()

    resp = await _confirm_task(api_client, test_project["id"], raw_key, "Stale key task")
    assert resp.status_code == 201

    refreshed = (await api_db.get(APIKey, key_id, populate_existing=True)).last_used_at
    assert refreshed > stale
    assert datetime.now(UTC).replace(tzinfo=None) - refreshed < LAST_USED_THROTTLE


@pytest.mark.asyncio
async def test_insufficient_scope_error_code(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """A key without the required scope gets a 403 with the INSUFFICIENT_SCOPE code."""
    raw_key, _ = await _mint_api_key(api_client, manager_headers, ["read:tasks"])

    resp = await _confirm_task(api_client, test_project["id"], raw_key, "Should not be created")

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "INSUFFICIENT_SCOPE"
