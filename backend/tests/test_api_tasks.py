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
    assert data["assignee_id"] is not None  # defaults to creator


@pytest.mark.asyncio
async def test_create_task_explicit_null_assignee(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Unassigned Task", "assignee_id": None},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is not None  # null treated same as omit — defaults to creator


@pytest.mark.asyncio
async def test_create_project_task_defaults_to_creator(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Project Task"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is not None  # defaults to creator


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


@pytest.mark.asyncio
async def test_create_task_with_invalid_status_rejected(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Bad Status Task", "status": "nonexistent"},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_task_with_valid_custom_status(
    api_client: AsyncClient, manager_headers: dict, test_story: dict, test_project: dict
):
    pid = test_project["id"]
    # Create a custom status on the project
    await api_client.post(
        f"/api/v1/projects/{pid}/statuses",
        json={"slug": "deployed", "name": "Deployed", "colour": "#7c3aed", "order": 10},
        headers=manager_headers,
    )
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Deployed Task", "status": "deployed"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "deployed"
