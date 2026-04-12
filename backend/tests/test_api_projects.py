import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_project(api_client: AsyncClient, manager_headers: dict):
    resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "My Project"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Project"
    assert "id" in data
    assert data["archived_at"] is None


@pytest.mark.asyncio
async def test_create_project_unauthenticated(api_client: AsyncClient):
    resp = await api_client.post("/api/v1/projects", json={"name": "X"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_projects(api_client: AsyncClient, manager_headers: dict, test_project: dict):
    resp = await api_client.get("/api/v1/projects", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "next_cursor" in data
    ids = [p["id"] for p in data["items"]]
    assert test_project["id"] in ids


@pytest.mark.asyncio
async def test_get_project(api_client: AsyncClient, manager_headers: dict, test_project: dict):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}", headers=manager_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == pid


@pytest.mark.asyncio
async def test_update_project(api_client: AsyncClient, manager_headers: dict, test_project: dict):
    pid = test_project["id"]
    resp = await api_client.patch(
        f"/api/v1/projects/{pid}",
        json={"name": "Renamed Project"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Project"


@pytest.mark.asyncio
async def test_delete_project(api_client: AsyncClient, manager_headers: dict):
    create = await api_client.post(
        "/api/v1/projects",
        json={"name": "To Delete"},
        headers=manager_headers,
    )
    pid = create.json()["id"]

    resp = await api_client.delete(f"/api/v1/projects/{pid}", headers=manager_headers)
    assert resp.status_code == 204

    get = await api_client.get(f"/api/v1/projects/{pid}", headers=manager_headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_archive_and_restore(api_client: AsyncClient, manager_headers: dict, test_project: dict):
    pid = test_project["id"]

    archive = await api_client.post(f"/api/v1/projects/{pid}/archive", headers=manager_headers)
    assert archive.status_code == 200
    assert archive.json()["archived_at"] is not None

    restore = await api_client.post(f"/api/v1/projects/{pid}/restore", headers=manager_headers)
    assert restore.status_code == 200
    assert restore.json()["archived_at"] is None
