# backend/tests/test_api_search.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_search_requires_auth(api_client: AsyncClient):
    resp = await api_client.get("/api/v1/search?q=test")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_search_empty_query_rejected(api_client: AsyncClient, auth_headers: dict):
    resp = await api_client.get("/api/v1/search?q=", headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_too_long_query_rejected(api_client: AsyncClient, auth_headers: dict):
    long_q = "a" * 201
    resp = await api_client.get(f"/api/v1/search?q={long_q}", headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_returns_matching_project(
    api_client: AsyncClient, manager_headers: dict
):
    unique = "UniqueProjectXYZ123"
    create_resp = await api_client.post(
        "/api/v1/projects",
        json={"name": unique},
        headers=manager_headers,
    )
    assert create_resp.status_code == 201
    project = create_resp.json()

    resp = await api_client.get(f"/api/v1/search?q=UniqueProjectXYZ123", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    match = next((i for i in items if i["id"] == project["id"]), None)
    assert match is not None
    assert match["type"] == "project"
    assert match["title"] == unique
    assert match["project_id"] == project["id"]
    assert match["story_id"] is None


@pytest.mark.asyncio
async def test_search_returns_matching_story(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    unique = "UniqueStoryABC456"
    create_resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/stories",
        json={"title": unique},
        headers=manager_headers,
    )
    assert create_resp.status_code == 201
    story = create_resp.json()

    resp = await api_client.get(f"/api/v1/search?q=UniqueStoryABC456", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    match = next((i for i in items if i["id"] == story["id"]), None)
    assert match is not None
    assert match["type"] == "story"
    assert match["title"] == unique
    assert match["project_id"] == test_project["id"]
    assert match["story_id"] is None


@pytest.mark.asyncio
async def test_search_returns_matching_task(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    unique = "UniqueTaskDEF789"
    create_resp = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": unique},
        headers=manager_headers,
    )
    assert create_resp.status_code == 201
    task = create_resp.json()

    resp = await api_client.get(f"/api/v1/search?q=UniqueTaskDEF789", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()
    match = next((i for i in items if i["id"] == task["id"]), None)
    assert match is not None
    assert match["type"] == "task"
    assert match["title"] == unique
    assert match["project_id"] == test_project["id"]


@pytest.mark.asyncio
async def test_search_matches_description(
    api_client: AsyncClient, manager_headers: dict
):
    unique_desc = "xq9DescriptionOnlyToken"
    create_resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "A Generic Project Name", "description": unique_desc},
        headers=manager_headers,
    )
    assert create_resp.status_code == 201
    project = create_resp.json()

    resp = await api_client.get(
        f"/api/v1/search?q=xq9DescriptionOnlyToken", headers=manager_headers
    )
    assert resp.status_code == 200
    items = resp.json()
    match = next((i for i in items if i["id"] == project["id"]), None)
    assert match is not None
    assert match["type"] == "project"


@pytest.mark.asyncio
async def test_search_no_results(api_client: AsyncClient, manager_headers: dict):
    resp = await api_client.get(
        "/api/v1/search?q=zzzNothingMatchesThisString99999", headers=manager_headers
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_search_contributor_cannot_see_unrelated_project(
    api_client: AsyncClient, auth_headers: dict, manager_headers: dict
):
    unique = "ManagerOnlyProject777"
    create_resp = await api_client.post(
        "/api/v1/projects",
        json={"name": unique},
        headers=manager_headers,
    )
    assert create_resp.status_code == 201
    project = create_resp.json()

    resp = await api_client.get(
        f"/api/v1/search?q=ManagerOnlyProject777", headers=auth_headers
    )
    assert resp.status_code == 200
    items = resp.json()
    match = next((i for i in items if i["id"] == project["id"]), None)
    assert match is None
