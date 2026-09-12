"""Route-level tests for /config/llm-providers (T15).

Security-critical invariant under test: the raw API key must never appear in any
response body — assertions run against raw response text, not just parsed fields.
"""

import json
import uuid

import httpx
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.services.llm_credential_service as svc
from app.api.schemas.llm_provider import UserLLMProviderUpdate
from app.core.config import settings
from app.core.crypto import encrypt_secret
from app.core.llm.base import LLMAuthError, LLMResponse
from app.db.base import RoleEnum
from app.db.models import User, UserLLMProvider

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
async def test_patch_valid_key_stores_hint_not_raw_key(api_client: AsyncClient, auth_headers: dict):
    patch_resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    body = patch_resp.json()
    assert body["provider"] == "google"
    assert body["api_key_hint"] == RAW_KEY[-4:]
    assert RAW_KEY not in patch_resp.text

    get_resp = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    assert get_resp.status_code == 200
    listed = get_resp.json()
    assert len(listed) == 1
    assert listed[0]["api_key_hint"] == RAW_KEY[-4:]
    assert RAW_KEY not in get_resp.text


@pytest.mark.asyncio
async def test_patch_unavailable_provider_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/anthropic",
        json={"api_key": "sk-ant-whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "PROVIDER_NOT_AVAILABLE"


@pytest.mark.asyncio
async def test_patch_unknown_provider_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/made-up-provider",
        json={"api_key": "whatever"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "UNKNOWN_PROVIDER"


@pytest.mark.asyncio
async def test_patch_as_demo_forbidden(api_client: AsyncClient, demo_headers: dict):
    resp = await api_client.patch(
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
async def test_patch_invalid_key_rejected(api_client: AsyncClient, auth_headers: dict, monkeypatch):
    monkeypatch.setattr(svc, "get_llm_client_for", lambda provider_id: _FakeAuthErrorClient())
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        # Long enough to clear the schema's min_length, so this exercises the live
        # provider rejection rather than being turned away at the boundary.
        json={"api_key": "bad-key-but-long-enough"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "LLM_KEY_INVALID"


@pytest.mark.asyncio
async def test_patch_invalid_key_400_api_key_invalid_reason_rejected(
    api_client: AsyncClient, auth_headers: dict, monkeypatch
):
    """Confirmed live against the real Gemini API: an invalid key comes back as
    400 INVALID_ARGUMENT, not 401/403. Uses the real GeminiClient (not the
    _FakeAuthErrorClient stub) against a mocked transport, so this exercises the
    actual 400-body-parsing fix end to end through the save path — regression
    test for a key that was silently accepted as valid before this fix."""
    from app.core.llm.gemini_client import GeminiClient

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={
                "error": {
                    "code": 400,
                    "message": "API key not valid. Please pass a valid API key.",
                    "status": "INVALID_ARGUMENT",
                    "details": [
                        {
                            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                            "reason": "API_KEY_INVALID",
                            "domain": "googleapis.com",
                        }
                    ],
                }
            },
        )

    monkeypatch.setattr(
        svc,
        "get_llm_client_for",
        lambda provider_id: GeminiClient(transport=httpx.MockTransport(handler)),
    )
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": "test-fake-key-12345"},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "LLM_KEY_INVALID"

    # The rejected key must not have been persisted as a side effect.
    listing = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    assert listing.json() == []


@pytest.mark.asyncio
async def test_patch_provider_registry_wiring_bug_returns_503_not_200(
    api_client: AsyncClient, auth_headers: dict, monkeypatch
):
    """A provider marked available=True with no registered adapter is a server-side
    wiring bug (get_llm_client_for raises ValueError) — must not crash with a 500,
    and must not be swallowed as "probably fine" and ship an unvalidated key as 200."""

    def _broken_registry(provider_id):
        raise ValueError(f"provider {provider_id!r} is declared available but has no adapter")

    monkeypatch.setattr(svc, "get_llm_client_for", _broken_registry)
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "LLM_PROVIDER_MISCONFIGURED"

    # Nothing should have been persisted as a side effect of the failed save.
    listing = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    assert listing.json() == []


@pytest.mark.asyncio
async def test_patch_encryption_unavailable_returns_503(
    api_client: AsyncClient, auth_headers: dict, monkeypatch
):
    monkeypatch.setattr(settings, "CREDENTIAL_ENCRYPTION_KEY", "")
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert resp.status_code == 503
    assert resp.json()["error"]["code"] == "CREDENTIAL_STORAGE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_patch_rpm_limit_clamped_to_ceiling(api_client: AsyncClient, auth_headers: dict):
    """The ceiling binds what is *enforced*, not what is stored.

    Persisting the clamped value would destroy the user's stated intent: raising their
    ceiling later could not restore the limit they originally asked for, because the
    request had been overwritten with the old ceiling.
    """
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY, "rpm_limit": 999_999},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["rpm_limit"] == 999_999, "the user's requested limit should be preserved"
    assert body["effective_rpm"] == settings.LLM_MAX_RPM, "but the ceiling is what applies"


@pytest.mark.asyncio
async def test_patch_second_provider_default_clears_first(
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

    first = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert first.json()["is_default"] is True  # first credential ever → forced default

    second = await api_client.patch(
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
    patch_resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200

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
    patch_resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY},
        headers=auth_headers,
    )
    get_resp = await api_client.get("/api/v1/config/llm-providers", headers=auth_headers)
    available_resp = await api_client.get(
        "/api/v1/config/llm-providers/available", headers=auth_headers
    )

    for resp in (patch_resp, get_resp, available_resp):
        assert RAW_KEY not in resp.text
        assert RAW_KEY not in json.dumps(resp.json())

    delete_resp = await api_client.delete(
        "/api/v1/config/llm-providers/google", headers=auth_headers
    )
    assert delete_resp.status_code == 204
    assert RAW_KEY not in delete_resp.text


@pytest.mark.asyncio
async def test_concurrent_upsert_falls_back_to_update_instead_of_500(
    api_db: AsyncSession, monkeypatch
):
    """Simulates two near-simultaneous PATCHes for the same (user, provider): both
    see `existing is None`, and the loser's INSERT collides on the unique
    constraint. It must fall back to updating the winner's row, not 500."""
    user = User(
        email=f"race_{uuid.uuid4().hex[:8]}@example.com",
        name="Race Tester",
        password_hash="x",
        role=RoleEnum.manager,
        email_confirmed=True,
    )
    api_db.add(user)
    await api_db.commit()

    # The concurrent "winner": a row that already committed by the time our
    # request's own flush runs, even though its own existence check (below) is
    # forced to miss it.
    winner = UserLLMProvider(
        user_id=user.id,
        provider="google",
        api_key_encrypted=encrypt_secret("winner-key"),
        api_key_hint="winr",
        is_default=True,
    )
    api_db.add(winner)
    await api_db.commit()

    real_get_existing_row = svc._get_existing_row
    calls = {"n": 0}

    async def flaky_get_existing_row(user_arg, provider_id_arg, db_arg):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return await real_get_existing_row(user_arg, provider_id_arg, db_arg)

    monkeypatch.setattr(svc, "_get_existing_row", flaky_get_existing_row)

    result = await svc.upsert_provider(
        user, "google", UserLLMProviderUpdate(api_key="loser-key"), api_db
    )

    assert result.provider == "google"
    assert result.api_key_hint == "loser-key"[-4:]

    rows = (
        await api_db.scalars(select(UserLLMProvider).where(UserLLMProvider.user_id == user.id))
    ).all()
    assert len(rows) == 1
    assert rows[0].api_key_hint == "loser-key"[-4:]


@pytest.mark.asyncio
async def test_patch_api_key_too_long_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": "x" * 513},
        headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_model_too_long_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.patch(
        "/api/v1/config/llm-providers/google",
        json={"api_key": RAW_KEY, "model": "x" * 101},
        headers=auth_headers,
    )
    assert resp.status_code == 422
