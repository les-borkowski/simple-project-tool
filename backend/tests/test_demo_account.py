"""Integration tests for demo account read-only enforcement."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


@pytest_asyncio.fixture
async def demo_headers(api_client: AsyncClient, api_db: AsyncSession) -> dict:
    """Register a demo user, mark is_demo=True, return auth headers."""
    email = f"demo_{uuid.uuid4().hex[:8]}@example.com"
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
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Projects — demo user blocked from writes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_demo_user_cannot_create_project(api_client: AsyncClient, demo_headers: dict):
    """Demo user → 403 DEMO_ACCOUNT when creating a project."""
    resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "Should Not Be Created"},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


@pytest.mark.asyncio
async def test_demo_user_can_read_projects(
    api_client: AsyncClient, demo_headers: dict, test_project: dict, api_db: AsyncSession
):
    """Demo user → can list projects they are a member of."""
    from app.db.base import RoleEnum
    from app.db.models import ProjectMember

    # Add demo user as a contributor member of test_project
    demo_user_resp = await api_client.get("/api/v1/auth/me", headers=demo_headers)
    demo_user_id = demo_user_resp.json()["id"]

    member = ProjectMember(
        project_id=uuid.UUID(test_project["id"]),
        user_id=uuid.UUID(demo_user_id),
        role=RoleEnum.contributor,
    )
    api_db.add(member)
    await api_db.flush()

    resp = await api_client.get("/api/v1/projects", headers=demo_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_demo_user_cannot_update_project(
    api_client: AsyncClient, demo_headers: dict, test_project: dict
):
    """Demo user → 403 DEMO_ACCOUNT when updating a project."""
    resp = await api_client.patch(
        f"/api/v1/projects/{test_project['id']}",
        json={"name": "New Name"},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


# ---------------------------------------------------------------------------
# Stories — demo user blocked from writes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_demo_user_cannot_create_story(
    api_client: AsyncClient, demo_headers: dict, test_project: dict
):
    """Demo user → 403 DEMO_ACCOUNT when creating a story."""
    resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/stories",
        json={"title": "Should Not Be Created"},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


# ---------------------------------------------------------------------------
# Tasks — demo user blocked from writes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_demo_user_cannot_create_task(
    api_client: AsyncClient, demo_headers: dict, test_story: dict
):
    """Demo user → 403 DEMO_ACCOUNT when creating a task."""
    resp = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Should Not Be Created"},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


# ---------------------------------------------------------------------------
# Auth — demo user cannot change their password
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_demo_user_cannot_change_password(api_client: AsyncClient, demo_headers: dict):
    """Demo user → 403 DEMO_ACCOUNT when trying to change password."""
    resp = await api_client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "testpassword123", "new_password": "newpassword456"},
        headers=demo_headers,
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


# ---------------------------------------------------------------------------
# /me — is_demo field returned in user response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_demo_user_me_returns_is_demo_true(api_client: AsyncClient, demo_headers: dict):
    """GET /auth/me → is_demo: true for demo users."""
    resp = await api_client.get("/api/v1/auth/me", headers=demo_headers)
    assert resp.status_code == 200
    assert resp.json()["is_demo"] is True


@pytest.mark.asyncio
async def test_regular_user_me_returns_is_demo_false(api_client: AsyncClient, auth_headers: dict):
    """GET /auth/me → is_demo: false for regular users."""
    resp = await api_client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["is_demo"] is False
