"""Gaps on the self-service config surface found in the pre-deploy review.

Each of these is enforcement that existed in spirit — in the frontend interceptor, in a
sibling service function, or in a field's documented intent — but not at the service or
schema layer where this codebase says enforcement belongs.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


async def _make_demo_user(db: AsyncSession) -> User:
    from app.auth.security import hash_password

    user = User(
        email=f"demo_{uuid.uuid4().hex[:8]}@example.com",
        name="Demo User",
        password_hash=hash_password("demo-password-123"),
        email_confirmed=True,
        is_demo=True,
    )
    db.add(user)
    await db.flush()
    return user


class TestDemoAccountsCannotMintApiKeys:
    """Every other self-service write on this branch guards demo accounts at the service
    layer. create_api_key was blocked only by the frontend axios interceptor, which by
    this repo's own rules is not enforcement — a direct POST bypasses it and yields a
    permanent credential to the shared demo account."""

    async def test_create_api_key_rejects_a_demo_user(self, api_db: AsyncSession):
        from app.api.schemas.api_key import APIKeyCreate
        from app.api.services import config_service

        user = await _make_demo_user(api_db)

        with pytest.raises(Exception) as exc_info:
            await config_service.create_api_key(
                APIKeyCreate(label="sneaky", scopes=["read:tasks"]), user, api_db
            )

        assert getattr(exc_info.value, "status_code", None) == 403

    async def test_a_normal_user_can_still_create_one(self, api_db: AsyncSession):
        from app.api.schemas.api_key import APIKeyCreate
        from app.api.services import config_service
        from app.auth.security import hash_password

        user = User(
            email=f"normal_{uuid.uuid4().hex[:8]}@example.com",
            name="Normal",
            password_hash=hash_password("password-123"),
            email_confirmed=True,
        )
        api_db.add(user)
        await api_db.flush()

        created = await config_service.create_api_key(
            APIKeyCreate(label="legit", scopes=["read:tasks"]), user, api_db
        )
        assert created.key


class TestProviderCatalogueRequiresAuth:
    async def test_available_providers_rejects_an_anonymous_caller(self, api_client: AsyncClient):
        """It leaks LLM_MODEL and the provider catalogue to anyone who asks."""
        resp = await api_client.get("/api/v1/config/llm-providers/available")
        assert resp.status_code == 401

    async def test_available_providers_still_serves_an_authenticated_caller(
        self, api_client: AsyncClient, auth_headers: dict
    ):
        resp = await api_client.get("/api/v1/config/llm-providers/available", headers=auth_headers)
        assert resp.status_code == 200
        assert any(item["id"] == "google" for item in resp.json())


class TestProviderUpdateValidatesItsFields:
    def test_model_rejects_path_traversal(self):
        """`model` is interpolated into the provider URL path. Only max_length guarded it,
        so `../` segments could redirect the server's request elsewhere on the host."""
        from pydantic import ValidationError

        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        with pytest.raises(ValidationError):
            UserLLMProviderUpdate(model="../../v1beta/models/other:generateContent")

    def test_model_rejects_whitespace_and_slashes(self):
        from pydantic import ValidationError

        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        for bad in ["gemini flash", "a/b", "model\n", "mo del"]:
            with pytest.raises(ValidationError):
                UserLLMProviderUpdate(model=bad)

    def test_model_accepts_real_model_ids(self):
        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        for good in ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gpt-4o_mini"]:
            assert UserLLMProviderUpdate(model=good).model == good

    def test_zero_rpm_limit_is_rejected(self):
        """A stored 0 makes `count >= 0` always true, so every capture 429s until the
        user works out why. Nothing legitimate sets a per-credential limit of zero."""
        from pydantic import ValidationError

        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        with pytest.raises(ValidationError):
            UserLLMProviderUpdate(rpm_limit=0)

    def test_zero_tpm_limit_is_rejected(self):
        from pydantic import ValidationError

        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        with pytest.raises(ValidationError):
            UserLLMProviderUpdate(tpm_limit=0)

    def test_negative_limits_are_rejected(self):
        from pydantic import ValidationError

        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        with pytest.raises(ValidationError):
            UserLLMProviderUpdate(rpm_limit=-1)

    def test_a_short_api_key_is_rejected_before_it_becomes_its_own_hint(self):
        """api_key_hint is api_key[-4:], so a sub-4-character key would be stored as its
        own hint."""
        from pydantic import ValidationError

        from app.api.schemas.llm_provider import UserLLMProviderUpdate

        with pytest.raises(ValidationError):
            UserLLMProviderUpdate(api_key="abc")
