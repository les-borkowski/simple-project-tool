# backend/tests/test_api_recent.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_recent_requires_auth(api_client: AsyncClient):
    resp = await api_client.get("/api/v1/recent")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_recent_empty(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.get("/api/v1/recent", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_recent_returns_project(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 1
    project_item = next((i for i in items if i["type"] == "project"), None)
    assert project_item is not None
    assert project_item["id"] == test_project["id"]
    assert project_item["title"] == test_project["name"]
    assert project_item["project_id"] == test_project["id"]
    assert project_item["story_id"] is None
    assert "updated_at" in project_item


@pytest.mark.asyncio
async def test_recent_returns_story(
    api_client: AsyncClient, manager_headers: dict, test_story: dict, test_project: dict
):
    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    story_item = next((i for i in items if i["type"] == "story"), None)
    assert story_item is not None
    assert story_item["id"] == test_story["id"]
    assert story_item["project_id"] == test_project["id"]
    assert story_item["story_id"] is None


@pytest.mark.asyncio
async def test_recent_returns_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    task_resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/tasks",
        json={"title": "Recent task"},
        headers=manager_headers,
    )
    assert task_resp.status_code == 201
    task = task_resp.json()

    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    task_item = next((i for i in items if i["type"] == "task" and i["id"] == task["id"]), None)
    assert task_item is not None
    assert task_item["project_id"] == test_project["id"]


@pytest.mark.asyncio
async def test_recent_max_five(api_client: AsyncClient, manager_headers: dict):
    for i in range(6):
        await api_client.post(
            "/api/v1/projects",
            json={"name": f"Extra Project {i}"},
            headers=manager_headers,
        )
    resp = await api_client.get("/api/v1/recent", headers=manager_headers)
    assert resp.status_code == 200
    assert len(resp.json()) <= 5


@pytest.mark.asyncio
async def test_recent_contributor_sees_only_own_projects(
    api_client: AsyncClient, auth_headers: dict, manager_headers: dict
):
    # Manager creates a project the contributor is NOT a member of
    await api_client.post(
        "/api/v1/projects",
        json={"name": "Manager Only Project"},
        headers=manager_headers,
    )

    resp = await api_client.get("/api/v1/recent", headers=auth_headers)
    assert resp.status_code == 200
    # Contributor has no projects of their own → empty list
    assert resp.json() == []
