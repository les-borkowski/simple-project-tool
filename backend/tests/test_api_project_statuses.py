import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User


@pytest.mark.asyncio
async def test_list_project_statuses_has_defaults(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}/statuses", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    slugs = [s["slug"] for s in data]
    assert slugs == ["to_do", "in_progress", "in_review", "done"]


@pytest.mark.asyncio
async def test_create_project_status(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/statuses",
        json={"slug": "shipped", "name": "Shipped", "colour": "#7c3aed", "order": 4},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["slug"] == "shipped"
    assert data["name"] == "Shipped"
    assert data["colour"] == "#7c3aed"
    assert data["project_id"] == pid


@pytest.mark.asyncio
async def test_create_project_status_duplicate_slug_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/statuses",
        json={"slug": "to_do", "name": "To Do Again", "colour": "#000000", "order": 10},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_project_status_invalid_slug_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/statuses",
        json={"slug": "My Status!", "name": "Bad", "colour": "#000000", "order": 10},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_project_status(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}/statuses", headers=manager_headers)
    statuses = resp.json()
    sid = statuses[0]["id"]

    resp = await api_client.patch(
        f"/api/v1/projects/{pid}/statuses/{sid}",
        json={"name": "Backlog", "colour": "#ff0000"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Backlog"
    assert data["colour"] == "#ff0000"
    assert data["slug"] == "to_do"  # slug is immutable


@pytest.mark.asyncio
async def test_delete_project_status(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}/statuses", headers=manager_headers)
    statuses = resp.json()
    sid = statuses[-1]["id"]  # delete "done"

    resp = await api_client.delete(
        f"/api/v1/projects/{pid}/statuses/{sid}", headers=manager_headers
    )
    assert resp.status_code == 204

    resp = await api_client.get(f"/api/v1/projects/{pid}/statuses", headers=manager_headers)
    remaining = resp.json()
    assert all(s["slug"] != "done" for s in remaining)


@pytest.mark.asyncio
async def test_contributor_cannot_create_status(
    api_client: AsyncClient,
    auth_headers: dict,
    test_project: dict,
    manager_headers: dict,
    api_db: AsyncSession,
):
    pid = test_project["id"]
    # Register contributor
    email = f"contrib_{uuid.uuid4().hex[:6]}@test.com"
    register_payload = {"email": email, "name": "C", "password": "pass1234!"}
    await api_client.post("/api/v1/auth/register", json=register_payload)
    await api_db.execute(sa_update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()
    login_payload = {"email": email, "password": "pass1234!"}
    login = await api_client.post("/api/v1/auth/login", json=login_payload)
    token = login.json()["access_token"]
    contrib_headers = {"Authorization": f"Bearer {token}"}
    me = await api_client.get("/api/v1/auth/me", headers=contrib_headers)
    contrib_id = me.json()["id"]
    await api_client.post(
        f"/api/v1/projects/{pid}/members",
        json={"user_id": contrib_id, "role": "contributor"},
        headers=manager_headers,
    )
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/statuses",
        json={"slug": "wip", "name": "WIP", "colour": "#000000", "order": 10},
        headers=contrib_headers,
    )
    assert resp.status_code == 403
