import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "My Task"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "My Task"
    assert data["story_id"] == sid
    assert "id" in data
    assert data["assignee_id"] is None


@pytest.mark.asyncio
async def test_list_tasks(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Listed Task"},
        headers=manager_headers,
    )
    task_id = create.json()["id"]

    resp = await api_client.get(f"/api/v1/stories/{sid}/tasks", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    ids = [t["id"] for t in data["items"]]
    assert task_id in ids


@pytest.mark.asyncio
async def test_get_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Gettable Task"},
        headers=manager_headers,
    )
    tid = create.json()["id"]

    resp = await api_client.get(f"/api/v1/tasks/{tid}", headers=manager_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == tid


@pytest.mark.asyncio
async def test_update_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Original"},
        headers=manager_headers,
    )
    tid = create.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{tid}",
        json={"title": "Updated Task"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Task"


@pytest.mark.asyncio
async def test_delete_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "To Delete"},
        headers=manager_headers,
    )
    tid = create.json()["id"]

    resp = await api_client.delete(f"/api/v1/tasks/{tid}", headers=manager_headers)
    assert resp.status_code == 204

    get = await api_client.get(f"/api/v1/tasks/{tid}", headers=manager_headers)
    assert get.status_code == 404
