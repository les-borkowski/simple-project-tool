"""Agents must be kept out of human-only flows (login, email flows, invitations, capture)."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import Depends, FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin import users_service
from app.api.schemas.api_key import APIKeyCreate
from app.api.schemas.project import MemberResponse
from app.api.services import (
    auth_service,
    capture_resolution_service,
    config_service,
    invitation_service,
)
from app.auth import dependencies, permissions
from app.auth.security import create_password_reset_token, create_refresh_token
from app.db.base import RoleEnum
from app.db.database import get_db
from app.db.models import ProjectMember, User
from tests.helpers import make_agent


@pytest_asyncio.fixture
async def owner(api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict) -> User:
    resp = await api_client.get("/api/v1/auth/me", headers=manager_headers)
    return await api_db.get(User, resp.json()["id"])


@pytest_asyncio.fixture
async def agent(api_db: AsyncSession, owner: User) -> User:
    return await make_agent(api_db, owner, name="deploy-bot")


async def agent_key(api_db: AsyncSession, user: User, *scopes: str) -> str:
    created = await config_service.create_api_key(
        APIKeyCreate(label="t", scopes=list(scopes)), user, api_db
    )
    return created.key


async def test_agent_cannot_login(api_client: AsyncClient, agent: User):
    unknown = await api_client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "whatever123"}
    )
    as_agent = await api_client.post(
        "/api/v1/auth/login",
        json={"email": f"{agent.name}@example.com", "password": "whatever123"},
    )
    assert unknown.status_code == as_agent.status_code == 401
    assert unknown.json() == as_agent.json()
    assert as_agent.json()["error"]["message"] == "Invalid email or password"


async def test_forgot_password_and_resend_ignore_agents(api_client: AsyncClient, agent: User):
    send = AsyncMock()
    with (
        patch("app.core.email.send_email", new=send),
        patch("app.core.email.send_password_reset_email", new=send),
        patch("app.core.email.send_confirmation_email", new=send),
    ):
        for path in ("/api/v1/auth/password-reset", "/api/v1/auth/resend-confirmation"):
            unknown = await api_client.post(path, json={"email": "nobody@example.com"})
            as_agent = await api_client.post(path, json={"email": f"{agent.name}@example.com"})
            assert unknown.status_code == as_agent.status_code == 200
            assert unknown.json() == as_agent.json()
    send.assert_not_called()


async def test_admin_password_reset_rejects_agent(api_db: AsyncSession, agent: User):
    background_tasks = MagicMock()
    with pytest.raises(HTTPException) as exc:
        await users_service.send_password_reset(api_db, agent.id, background_tasks)
    assert exc.value.status_code == 403
    assert exc.value.detail == "HUMAN_ONLY"
    background_tasks.add_task.assert_not_called()


async def test_agent_key_works_before_owner_blocked(
    api_client: AsyncClient, api_db: AsyncSession, agent: User
):
    key = await agent_key(api_db, agent, "read:projects")
    resp = await api_client.get("/api/v1/projects", headers={"X-API-Key": key})
    assert resp.status_code == 200


async def test_agent_key_blocked_when_owner_blocked(
    api_client: AsyncClient, api_db: AsyncSession, owner: User, agent: User
):
    key = await agent_key(api_db, agent, "read:projects")
    owner.is_blocked = True
    await api_db.flush()

    resp = await api_client.get("/api/v1/projects", headers={"X-API-Key": key})

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ACCOUNT_BLOCKED"


async def test_capture_and_confirm_reject_agent(
    api_client: AsyncClient,
    api_db: AsyncSession,
    agent: User,
    test_project: dict,
    set_llm_client,
):
    llm = MagicMock()
    llm.complete = AsyncMock()
    set_llm_client(llm)
    api_db.add(
        ProjectMember(
            project_id=uuid.UUID(test_project["id"]), user_id=agent.id, role=RoleEnum.manager
        )
    )
    await api_db.flush()
    headers = {"X-API-Key": await agent_key(api_db, agent, "write:tasks")}
    base = f"/api/v1/projects/{test_project['id']}/tasks/capture"

    preview = await api_client.post(base, json={"text": "Fix the login bug"}, headers=headers)
    confirm = await api_client.post(
        f"{base}/confirm", json={"tasks": [{"title": "Fix the login bug"}]}, headers=headers
    )

    for resp in (preview, confirm):
        assert resp.status_code == 403, resp.text
        assert resp.json()["error"]["code"] == "HUMAN_ONLY"
    llm.complete.assert_not_called()


def _member(name: str, email: str | None) -> MemberResponse:
    return MemberResponse.model_construct(
        user_id=uuid.uuid4(), role=RoleEnum.contributor, joined_at=None, name=name, email=email
    )


def test_resolution_handles_null_email_member():
    agent_member = _member("Deploy Bot", None)
    human_member = _member("Alice Smith", "alice@example.com")

    resolved_id, resolved = capture_resolution_service.resolve_assignee_hint(
        "alice", [agent_member, human_member]
    )

    assert resolved is True
    assert resolved_id == human_member.user_id


async def test_admin_delete_user_with_agents_fails_cleanly(
    api_db: AsyncSession, owner: User, agent: User
):
    # Release the fixture savepoint so a failed delete cannot roll the rows back.
    await api_db.commit()

    with pytest.raises(Exception) as exc:
        await users_service.delete_user(api_db, owner.id)

    assert not isinstance(exc.value, IntegrityError)
    assert "agent" in str(getattr(exc.value, "detail", exc.value)).lower()
    assert await api_db.scalar(select(User.id).where(User.id == agent.id)) == agent.id


async def test_get_current_human_rejects_api_key_and_agent(
    api_db: AsyncSession, owner: User, agent: User, manager_headers: dict
):
    app = FastAPI()

    @app.get("/human-only")
    async def human_only(user: User = Depends(dependencies.get_current_human)):
        return {"id": str(user.id)}

    async def override_get_db():
        yield api_db

    app.dependency_overrides[get_db] = override_get_db
    human_key = await agent_key(api_db, owner, "read:projects")
    agent_api_key = await agent_key(api_db, agent, "read:projects")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        ok = await client.get("/human-only", headers=manager_headers)
        by_agent = await client.get("/human-only", headers={"X-API-Key": agent_api_key})
        by_human_key = await client.get("/human-only", headers={"X-API-Key": human_key})

    assert ok.status_code == 200
    assert by_agent.status_code in (401, 403)
    assert by_human_key.status_code in (401, 403)


async def test_require_human_rejects_agent_only(owner: User, agent: User):
    permissions.require_human(owner)
    with pytest.raises(HTTPException) as exc:
        permissions.require_human(agent)
    assert (exc.value.status_code, exc.value.detail) == (403, "HUMAN_ONLY")


async def test_invitation_entrypoints_reject_agent(api_db: AsyncSession, agent: User):
    calls = (
        lambda: invitation_service.accept_invitation(uuid.uuid4(), agent, api_db),
        lambda: invitation_service.decline_invitation(uuid.uuid4(), agent, api_db),
        lambda: invitation_service.list_my_invitations(agent, api_db),
    )
    for call in calls:
        with pytest.raises(HTTPException) as exc:
            await call()
        assert (exc.value.status_code, exc.value.detail) == (403, "HUMAN_ONLY")


async def test_me_works_for_agent_key(api_client: AsyncClient, api_db: AsyncSession, agent: User):
    key = await agent_key(api_db, agent, "read:projects")
    resp = await api_client.get("/api/v1/auth/me", headers={"X-API-Key": key})
    assert resp.status_code == 200
    assert resp.json()["name"] == "deploy-bot"
    assert resp.json().get("email") is None  # /me uses exclude_none


async def test_change_password_rejects_agent(api_db: AsyncSession, agent: User):
    with pytest.raises(HTTPException) as exc:
        await auth_service.change_password("old-password", "new-password-1", agent, api_db)
    assert (exc.value.status_code, exc.value.detail) == (403, "HUMAN_ONLY")
    assert agent.password_hash is None


async def test_change_password_route_rejects_agent_key(
    api_client: AsyncClient, api_db: AsyncSession, agent: User
):
    key = await agent_key(api_db, agent, "read:projects")
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "x", "new_password": "new-password-1"},
        headers={"X-API-Key": key},
    )
    assert resp.status_code in (401, 403)


async def test_confirm_password_reset_rejects_agent(api_db: AsyncSession, agent: User):
    token = create_password_reset_token(agent.id, agent.password_changed_at)
    with pytest.raises(HTTPException) as exc:
        await auth_service.confirm_password_reset(token, "new-password-1", api_db)
    assert (exc.value.status_code, exc.value.detail) == (403, "HUMAN_ONLY")
    assert agent.password_hash is None


async def test_refresh_rejects_agent(api_db: AsyncSession, agent: User):
    token = create_refresh_token(agent.id)
    with pytest.raises(HTTPException) as exc:
        await auth_service.refresh_token_fn(token, api_db)
    assert (exc.value.status_code, exc.value.detail) == (403, "HUMAN_ONLY")


async def test_agent_owned_by_agent_key_rejected(
    api_client: AsyncClient, api_db: AsyncSession, agent: User
):
    nested = await make_agent(api_db, agent, name="nested-bot")
    key = await agent_key(api_db, nested, "read:projects")
    resp = await api_client.get("/api/v1/projects", headers={"X-API-Key": key})
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ACCOUNT_BLOCKED"


async def test_delete_integrity_error_mapping(
    api_db: AsyncSession, owner: User, agent: User, monkeypatch
):
    owner_id = owner.id

    async def no_agents(*args, **kwargs):
        return 0

    def fail_with(constraint: str):
        async def commit():
            raise IntegrityError("DELETE", {}, Exception(f'violates constraint "{constraint}"'))

        return commit

    monkeypatch.setattr(api_db, "scalar", no_agents)
    monkeypatch.setattr(api_db, "commit", fail_with("users_owner_id_fkey"))
    with pytest.raises(users_service.UserHasAgentsError):
        await users_service.delete_user(api_db, owner_id)

    monkeypatch.setattr(api_db, "commit", fail_with("some_other_fkey"))
    with pytest.raises(IntegrityError):
        await users_service.delete_user(api_db, owner_id)
