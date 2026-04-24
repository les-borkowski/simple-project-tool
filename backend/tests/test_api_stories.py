import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_story(api_client: AsyncClient, manager_headers: dict, test_project: dict):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "My Story"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "My Story"
    assert data["project_id"] == pid
    assert "id" in data


@pytest.mark.asyncio
async def test_list_stories(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}/stories", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    ids = [s["id"] for s in data["items"]]
    assert test_story["id"] in ids


@pytest.mark.asyncio
async def test_get_story(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    resp = await api_client.get(f"/api/v1/stories/{sid}", headers=manager_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == sid


@pytest.mark.asyncio
async def test_update_story(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    resp = await api_client.patch(
        f"/api/v1/stories/{sid}",
        json={"title": "Updated Story"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Story"


@pytest.mark.asyncio
async def test_delete_story(api_client: AsyncClient, manager_headers: dict, test_project: dict):
    pid = test_project["id"]
    create = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "To Delete"},
        headers=manager_headers,
    )
    sid = create.json()["id"]

    resp = await api_client.delete(f"/api/v1/stories/{sid}", headers=manager_headers)
    assert resp.status_code == 204

    get = await api_client.get(f"/api/v1/stories/{sid}", headers=manager_headers)
    assert get.status_code == 404
