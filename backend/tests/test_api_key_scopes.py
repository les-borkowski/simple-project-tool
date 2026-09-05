import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.api_key import APIKeyCreate
from app.api.services import config_service
from app.db.models import User

# (method, path_template, required_scope)
SCOPED_ROUTES = [
    ("GET", "/api/v1/projects", "read:projects"),
    ("GET", "/api/v1/projects/{project_id}", "read:projects"),
    ("GET", "/api/v1/projects/{project_id}/members", "read:projects"),
    ("GET", "/api/v1/projects/{project_id}/statuses", "read:projects"),
    ("GET", "/api/v1/search?q=x", "read:projects"),
    ("GET", "/api/v1/projects/{project_id}/stories", "read:stories"),
    ("GET", "/api/v1/stories/{story_id}", "read:stories"),
    ("POST", "/api/v1/projects/{project_id}/stories", "write:stories"),
    ("PATCH", "/api/v1/stories/{story_id}", "write:stories"),
    ("GET", "/api/v1/projects/{project_id}/tasks", "read:tasks"),
    ("GET", "/api/v1/stories/{story_id}/tasks", "read:tasks"),
    ("GET", "/api/v1/tasks/{task_id}", "read:tasks"),
    ("POST", "/api/v1/projects/{project_id}/tasks", "write:tasks"),
    ("POST", "/api/v1/stories/{story_id}/tasks", "write:tasks"),
    ("PATCH", "/api/v1/tasks/{task_id}", "write:tasks"),
    ("GET", "/api/v1/projects/{project_id}/comments", "read:comments"),
    ("GET", "/api/v1/stories/{story_id}/comments", "read:comments"),
    ("GET", "/api/v1/tasks/{task_id}/comments", "read:comments"),
    ("POST", "/api/v1/projects/{project_id}/comments", "write:comments"),
    ("POST", "/api/v1/stories/{story_id}/comments", "write:comments"),
    ("POST", "/api/v1/tasks/{task_id}/comments", "write:comments"),
]

READ_TASKS_ROUTES = [row for row in SCOPED_ROUTES if row[2] == "read:tasks"]

BODIES = {
    "/api/v1/projects/{project_id}/stories": {"title": "Scoped story"},
    "/api/v1/stories/{story_id}": {"title": "Renamed story"},
    "/api/v1/projects/{project_id}/tasks": {"title": "Scoped task"},
    "/api/v1/stories/{story_id}/tasks": {"title": "Scoped task"},
    "/api/v1/tasks/{task_id}": {"title": "Renamed task"},
    "/api/v1/projects/{project_id}/comments": {"body": "Scoped comment"},
    "/api/v1/stories/{story_id}/comments": {"body": "Scoped comment"},
    "/api/v1/tasks/{task_id}/comments": {"body": "Scoped comment"},
}


def route_ids(rows) -> list[str]:
    return [f"{method} {path} [{scope}]" for method, path, scope in rows]


def unrelated_scope(required: str) -> str:
    """A scope that neither equals nor implies the required one."""
    return "read:tasks" if required.endswith(":comments") else "read:comments"


async def call(client: AsyncClient, method: str, path: str, headers: dict, ids: dict):
    return await client.request(method, path.format(**ids), headers=headers, json=BODIES.get(path))


@pytest_asyncio.fixture
async def resources(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
) -> dict:
    """Project, story and task the scoped route templates address."""
    resp = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Scoped fixture task"},
        headers=manager_headers,
    )
    return {
        "project_id": test_project["id"],
        "story_id": test_story["id"],
        "task_id": resp.json()["id"],
    }


@pytest_asyncio.fixture
async def manager_user(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict
) -> User:
    resp = await api_client.get("/api/v1/auth/me", headers=manager_headers)
    return await api_db.get(User, resp.json()["id"])


@pytest_asyncio.fixture
async def make_key(api_db: AsyncSession, manager_user: User):
    """Mint real API keys for the manager through the hashing path used in production."""

    async def _make(*scopes: str):
        return await config_service.create_api_key(
            APIKeyCreate(label=f"key-{'-'.join(scopes)}", scopes=list(scopes)),
            manager_user,
            api_db,
        )

    return _make


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path", "scope"), SCOPED_ROUTES, ids=route_ids(SCOPED_ROUTES))
async def test_key_with_required_scope_is_allowed(
    api_client: AsyncClient, resources: dict, make_key, method: str, path: str, scope: str
):
    key = await make_key(scope)
    resp = await call(api_client, method, path, {"X-API-Key": key.key}, resources)
    assert 200 <= resp.status_code < 300, resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path", "scope"), SCOPED_ROUTES, ids=route_ids(SCOPED_ROUTES))
async def test_key_with_unrelated_scope_is_forbidden(
    api_client: AsyncClient, resources: dict, make_key, method: str, path: str, scope: str
):
    key = await make_key(unrelated_scope(scope))
    resp = await call(api_client, method, path, {"X-API-Key": key.key}, resources)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "INSUFFICIENT_SCOPE"


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path", "scope"), SCOPED_ROUTES, ids=route_ids(SCOPED_ROUTES))
async def test_revoked_key_is_unauthenticated(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_user: User,
    resources: dict,
    make_key,
    method: str,
    path: str,
    scope: str,
):
    key = await make_key(scope)
    await config_service.revoke_api_key(key.id, manager_user, api_db)
    resp = await call(api_client, method, path, {"X-API-Key": key.key}, resources)
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path", "scope"), SCOPED_ROUTES, ids=route_ids(SCOPED_ROUTES))
async def test_no_credentials_is_unauthenticated(
    api_client: AsyncClient, resources: dict, method: str, path: str, scope: str
):
    resp = await call(api_client, method, path, {}, resources)
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path", "scope"), SCOPED_ROUTES, ids=route_ids(SCOPED_ROUTES))
async def test_jwt_auth_is_unaffected_by_scopes(
    api_client: AsyncClient,
    manager_headers: dict,
    resources: dict,
    method: str,
    path: str,
    scope: str,
):
    resp = await call(api_client, method, path, manager_headers, resources)
    assert 200 <= resp.status_code < 300, resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "scope"), READ_TASKS_ROUTES, ids=route_ids(READ_TASKS_ROUTES)
)
async def test_write_scope_implies_read_scope(
    api_client: AsyncClient, resources: dict, make_key, method: str, path: str, scope: str
):
    key = await make_key("write:tasks")
    resp = await call(api_client, method, path, {"X-API-Key": key.key}, resources)
    assert 200 <= resp.status_code < 300, resp.text


@pytest_asyncio.fixture
async def searchable_resources(api_client: AsyncClient, manager_headers: dict) -> dict:
    """Project, story and task that all share a distinctive search term."""
    marker = "zzsearchmarker"
    project_resp = await api_client.post(
        "/api/v1/projects",
        json={"name": f"Project {marker}"},
        headers=manager_headers,
    )
    project = project_resp.json()
    story_resp = await api_client.post(
        f"/api/v1/projects/{project['id']}/stories",
        json={"title": f"Story {marker}"},
        headers=manager_headers,
    )
    story = story_resp.json()
    task_resp = await api_client.post(
        f"/api/v1/stories/{story['id']}/tasks",
        json={"title": f"Task {marker}"},
        headers=manager_headers,
    )
    task = task_resp.json()
    return {"project": project, "story": story, "task": task}


@pytest.mark.asyncio
async def test_search_with_read_projects_only_omits_story_and_task(
    api_client: AsyncClient, searchable_resources: dict, make_key
):
    key = await make_key("read:projects")
    resp = await api_client.get("/api/v1/search?q=zzsearchmarker", headers={"X-API-Key": key.key})
    assert resp.status_code == 200
    types = {item["type"] for item in resp.json()}
    assert types == {"project"}


@pytest.mark.asyncio
async def test_search_with_read_projects_and_tasks_omits_story(
    api_client: AsyncClient, searchable_resources: dict, make_key
):
    key = await make_key("read:projects", "read:tasks")
    resp = await api_client.get("/api/v1/search?q=zzsearchmarker", headers={"X-API-Key": key.key})
    assert resp.status_code == 200
    types = {item["type"] for item in resp.json()}
    assert types == {"project", "task"}


@pytest.mark.asyncio
async def test_search_with_jwt_auth_returns_all_types(
    api_client: AsyncClient, searchable_resources: dict, manager_headers: dict
):
    resp = await api_client.get("/api/v1/search?q=zzsearchmarker", headers=manager_headers)
    assert resp.status_code == 200
    types = {item["type"] for item in resp.json()}
    assert types == {"project", "story", "task"}
