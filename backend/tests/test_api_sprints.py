import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14", "capacity": 20},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Sprint 1"
    assert data["start_date"] == "2026-05-01"
    assert data["end_date"] == "2026-05-14"
    assert data["capacity"] == 20
    assert data["project_id"] == pid
    assert data["total_effort"] == 0
    assert data["task_count"] == 0


@pytest.mark.asyncio
async def test_list_sprints(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint A", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    resp = await api_client.get(f"/api/v1/projects/{pid}/sprints", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "Sprint A"


@pytest.mark.asyncio
async def test_update_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sid = r.json()["id"]
    resp = await api_client.patch(
        f"/api/v1/sprints/{sid}",
        json={"name": "Sprint 1 (revised)", "capacity": 30},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sprint 1 (revised)"
    assert resp.json()["capacity"] == 30


@pytest.mark.asyncio
async def test_delete_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sid = r.json()["id"]
    resp = await api_client.delete(f"/api/v1/sprints/{sid}", headers=manager_headers)
    assert resp.status_code == 204
    resp2 = await api_client.get(f"/api/v1/projects/{pid}/sprints", headers=manager_headers)
    assert resp2.json() == []


@pytest.mark.asyncio
async def test_create_sprint_requires_manager(
    api_client: AsyncClient, auth_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=auth_headers,
    )
    assert resp.status_code == 403
