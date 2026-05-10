import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models import User


async def _make_contributor_headers(api_client: AsyncClient, api_db: AsyncSession) -> dict:
    """Register a user and downgrade them to contributor, return auth headers."""
    email = f"contrib_{uuid.uuid4().hex[:8]}@example.com"
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": "Contributor", "password": "testpassword123"},
    )
    await api_db.execute(
        update(User)
        .where(User.email == email)
        .values(role=RoleEnum.contributor, email_confirmed=True)
    )
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_preferences_returns_defaults_when_none_saved(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """GET /projects/{id}/my-preferences returns default values when no record exists."""
    pid = test_project["id"]
    resp = await api_client.get(
        f"/api/v1/projects/{pid}/my-preferences",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == pid
    assert data["tab_order"] == ["board", "stories", "sprints", "timeline", "members"]
    assert data["hidden_tabs"] == []
    assert "id" in data
    assert "user_id" in data
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_put_preferences_saves_and_returns(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """PUT /projects/{id}/my-preferences saves and returns the updated preferences."""
    pid = test_project["id"]
    payload = {
        "tab_order": ["stories", "board", "members", "sprints", "timeline"],
        "hidden_tabs": ["timeline"],
    }
    resp = await api_client.put(
        f"/api/v1/projects/{pid}/my-preferences",
        json=payload,
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == pid
    assert data["tab_order"] == payload["tab_order"]
    assert data["hidden_tabs"] == payload["hidden_tabs"]
    assert "id" in data


@pytest.mark.asyncio
async def test_get_preferences_returns_saved_after_put(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """GET after PUT returns the saved preferences, not defaults."""
    pid = test_project["id"]
    payload = {
        "tab_order": ["members", "board", "stories", "sprints", "timeline"],
        "hidden_tabs": ["sprints", "timeline"],
    }
    await api_client.put(
        f"/api/v1/projects/{pid}/my-preferences",
        json=payload,
        headers=manager_headers,
    )
    resp = await api_client.get(
        f"/api/v1/projects/{pid}/my-preferences",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["tab_order"] == payload["tab_order"]
    assert data["hidden_tabs"] == payload["hidden_tabs"]


@pytest.mark.asyncio
async def test_get_preferences_returns_403_for_non_member(
    api_client: AsyncClient, api_db: AsyncSession, test_project: dict
):
    """GET /projects/{id}/my-preferences returns 403 for a contributor non-member."""
    headers = await _make_contributor_headers(api_client, api_db)
    pid = test_project["id"]
    resp = await api_client.get(
        f"/api/v1/projects/{pid}/my-preferences",
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_put_preferences_returns_403_for_non_member(
    api_client: AsyncClient, api_db: AsyncSession, test_project: dict
):
    """PUT /projects/{id}/my-preferences returns 403 for a contributor non-member."""
    headers = await _make_contributor_headers(api_client, api_db)
    pid = test_project["id"]
    resp = await api_client.put(
        f"/api/v1/projects/{pid}/my-preferences",
        json={"tab_order": ["board"], "hidden_tabs": []},
        headers=headers,
    )
    assert resp.status_code == 403
