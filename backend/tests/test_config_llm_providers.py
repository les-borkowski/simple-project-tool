"""Route-level tests for /config/llm-providers (T15).

Security-critical invariant under test: the raw API key must never appear in any
response body — assertions run against raw response text, not just parsed fields.
"""

import json
import uuid

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.services.llm_credential_service as svc
from app.core.config import settings
from app.core.llm.base import LLMAuthError, LLMResponse
from app.db.models import User

RAW_KEY = "AIzaSy-super-secret-test-key-000111222"


class _FakeOKClient:
    async def complete(self, *a, **kw):
        return LLMResponse(text="OK", model="m", prompt_tokens=1, completion_tokens=1, latency_ms=1)


class _FakeAuthErrorClient:
    async def complete(self, *a, **kw):
        raise LLMAuthError("credential rejected: 401")


@pytest.fixture(autouse=True)
def clear_fernet_cache():
    from app.core import crypto

    crypto._fernet_for_key.cache_clear()
    yield
    crypto._fernet_for_key.cache_clear()


@pytest.fixture(autouse=True)
def valid_encryption_key(monkeypatch):
    """Most tests need a working credential store; the one exception overrides this."""
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", Fernet.generate_key().decode())
    yield


@pytest.fixture(autouse=True)
def stub_key_validation(monkeypatch):
    """Live-validate against a fake client by default so no real network call happens."""
    monkeypatch.setattr(svc, "get_llm_client_for", lambda provider_id: _FakeOKClient())
    yield


@pytest_asyncio.fixture
async def demo_headers(api_client: AsyncClient, api_db: AsyncSession) -> dict:
    email = f"demo_{uuid.uuid4().hex[:8]}@example.com"
    from unittest.mock import AsyncMock, patch

    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Demo User", "password": "testpassword123"},
        )
    await api_db.execute(
        update(User).where(User.email == email).values(email_confirmed=True, is_demo=True)
    )
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "testpassword123"}
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_put_valid_key_stores_hint_not_raw_key(api_client: AsyncClient, auth_headers: dict):
    put_resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert put_resp.status_code == 200
    body = put_resp.json()
    assert body["provider"] == "google"
    assert body["api_key_hint"] == RAW_KEY[-4:]
    assert RAW_KEY not in put_resp.text

    get_resp = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    assert get_resp.status_code == 200
    listed = get_resp.json()
    assert len(listed) == 1
    assert listed[0]["api_key_hint"] == RAW_KEY[-4:]
    assert RAW_KEY not in get_resp.text


@pytest.mark.asyncio
async def test_put_unavailable_provider_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.put(
        "/api/v1/config/llm-providers/anthropic",
        json={"api_key": "sk-ant-whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "PROVIDER_NOT_AVAILABLE"


@pytest.mark.asyncio
async def test_put_unknown_provider_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.put(
        "/api/v1/config/llm-providers/made-up-provider",
        json={"api_key": "whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "UNKNOWN_PROVIDER"


@pytest.mark.asyncio
async def test_put_as_demo_forbidden(api_client: AsyncClient, demo_headers: dict):
    resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


@pytest.mark.asyncio
async def test_delete_as_demo_forbidden(api_client: AsyncClient, demo_headers: dict):
    resp = await api_client.delete(
        "/api/v1/config/llm-providers/google",
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


@pytest.mark.asyncio
async def test_get_as_demo_succeeds(api_client: AsyncClient, demo_headers: dict):
    """Demo accounts are read-only, not read-blocked — GET is a pure read (matches
    the read/write split enforced everywhere else `require_not_demo` is used)."""
    resp = await api_client.get("/api/v1/config/llm-providers", headers=demo_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_put_invalid_key_rejected(api_client: AsyncClient, auth_headers: dict, monkeypatch):
    monkeypatch.setattr(svc, "get_llm_client_for", lambda provider_id: _FakeAuthErrorClient())
    resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": "bad-key"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "LLM_KEY_INVALID"


@pytest.mark.asyncio
async def test_put_encryption_unavailable_returns_503(
    api_client: AsyncClient, auth_headers: dict, monkeypatch
):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", "")
    resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "CREDENTIAL_STORAGE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_put_rpm_limit_clamped_to_ceiling(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY, "rpm_limit": 999_999},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rpm_limit"] == settings.LLM_MAX_RPM
    assert body["effective_rpm"] == settings.LLM_MAX_RPM


@pytest.mark.asyncio
async def test_put_second_provider_default_clears_first(
    api_client: AsyncClient, auth_headers: dict, monkeypatch
):
    """PROVIDERS only has one available real provider, so register a second fake
    available one purely to exercise the is_default-clearing behaviour."""
    import app.core.llm.providers as providers_module
    from app.core.llm.providers import ProviderSpec

    monkeypatch.setitem(
        providers_module.PROVIDERS,
        "test-provider-2",
        ProviderSpec(
            id="test-provider-2",
            label="Test Provider 2",
            default_model="test-model",
            available=True,
            key_hint="starts with test-",
            docs_url="https://example.com",
            default_rpm=10,
            default_tpm=1_000,
        ),
    )

    first = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert first.json()["is_default"] is True  # first credential ever → forced default

    second = await api_client.put(
        "/api/v1/config/llm-providers/test-provider-2",
        json={"api_key": "another-secret-key", "is_default": True},
        headers=auth_headers,
    )
    assert second.status_code == 200
    assert second.json()["is_default"] is True

    listing = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    assert listing.status_code == 200
    by_provider = {row["provider"]: row for row in listing.json()}
    assert by_provider["google"]["is_default"] is False
    assert by_provider["test-provider-2"]["is_default"] is True


@pytest.mark.asyncio
async def test_delete_removes_credential(api_client: AsyncClient, auth_headers: dict):
    put_resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert put_resp.status_code == 200

    delete_resp = await api_client.delete(
        "/api/v1/config/llm-providers/google", headers=auth_headers
    )
    assert delete_resp.status_code == 204

    listing = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    assert listing.status_code == 200
    assert listing.json() == []


@pytest.mark.asyncio
async def test_raw_key_never_leaks_across_all_endpoints(
    api_client: AsyncClient, auth_headers: dict
):
    put_resp = await api_client.put(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    get_resp = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    available_resp = await api_client.get(
        "/api/v1/config/llm-providers/available", headers=auth_headers
    )

    for resp in (put_resp, get_resp, available_resp):
        assert RAW_KEY not in resp.text
        assert RAW_KEY not in json.dumps(resp.json())

    delete_resp = await api_client.delete(
        "/api/v1/config/llm-providers/google", headers=auth_headers
    )
    assert delete_resp.status_code == 204
    assert RAW_KEY not in delete_resp.text
