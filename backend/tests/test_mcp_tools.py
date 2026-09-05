import asyncio

import httpx
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.main import app
from app.api.schemas.api_key import APIKeyCreate
from app.api.services import config_service
from app.db.database import get_db
from app.db.models import User
from app.mcp.client import SPTClient
from app.mcp.config import MCPConfig
from app.mcp.server import (
    _add_comment_impl,
    _create_story_impl,
    _create_task_impl,
    _get_project_impl,
    _get_task_impl,
    _list_projects_impl,
    _list_stories_impl,
    _list_tasks_impl,
    _search_impl,
    _update_task_impl,
)


@pytest_asyncio.fixture
async def manager_user(
    api_client: AsyncClient, manager_headers: dict, api_db: AsyncSession
) -> User:
    resp = await api_client.get("/api/v1/auth/me", headers=manager_headers)
    return await api_db.get(User, resp.json()["id"])


async def _make_mcp_client(
    api_db: AsyncSession, manager_user: User, label: str, scopes: list[str]
) -> SPTClient:
    """Build an SPTClient hitting the real ASGI app in-process, authenticated with a real
    API key minted through the production hashing path.

    get_project fans out three requests concurrently via asyncio.gather. In production
    each request gets its own DB session/connection, so that's harmless; here all requests
    share the single per-test `api_db` session (needed for savepoint-based rollback
    isolation), which raises if used from two coroutines at once. A lock around the
    override serializes DB access without changing the tool's concurrent request shape.
    """
    lock = asyncio.Lock()

    async def locked_get_db():
        async with lock:
            yield api_db

    app.dependency_overrides[get_db] = locked_get_db

    key = await config_service.create_api_key(
        APIKeyCreate(label=label, scopes=scopes), manager_user, api_db
    )
    config = MCPConfig(api_url="http://test", api_key=key.key, locale="en-GB", timeout=30.0)
    return SPTClient(config, transport=httpx.ASGITransport(app=app))


@pytest_asyncio.fixture
async def mcp_client(api_client: AsyncClient, api_db: AsyncSession, manager_user: User):
    """Read-only-scoped SPTClient - see _make_mcp_client for the shared setup."""
    client = await _make_mcp_client(
        api_db,
        manager_user,
        "mcp-test-key",
        ["read:projects", "read:stories", "read:tasks", "read:comments"],
    )
    yield client
    await client.aclose()


@pytest_asyncio.fixture
async def mcp_write_client(api_client: AsyncClient, api_db: AsyncSession, manager_user: User):
    """Same as mcp_client, but the API key carries write scopes too - for the write tools."""
    client = await _make_mcp_client(
        api_db,
        manager_user,
        "mcp-write-test-key",
        ["write:projects", "write:stories", "write:tasks", "write:comments"],
    )
    yield client
    await client.aclose()


@pytest_asyncio.fixture
async def test_task(api_client: AsyncClient, manager_headers: dict, test_story: dict) -> dict:
    """Task creation defaults assignee_id to the creator, so this is an assigned task."""
    resp = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Test Task"},
        headers=manager_headers,
    )
    return resp.json()


@pytest_asyncio.fixture
async def unassigned_task(api_client: AsyncClient, manager_headers: dict, test_story: dict) -> dict:
    """Explicitly clears the creator-default assignee via PATCH - there's no way to create
    a genuinely unassigned task straight through the public create-task routes."""
    resp = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Unassigned Task"},
        headers=manager_headers,
    )
    task = resp.json()
    resp = await api_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"assignee_id": None},
        headers=manager_headers,
    )
    return resp.json()


async def test_list_projects_returns_seeded_project(mcp_client, test_project):
    projects = await _list_projects_impl(mcp_client)

    ids = [p["id"] for p in projects]
    assert test_project["id"] in ids


async def test_get_project_fans_out_members_and_statuses(mcp_client, test_project):
    result = await _get_project_impl(mcp_client, test_project["id"])

    assert result["project"]["id"] == test_project["id"]
    assert isinstance(result["members"], list) and result["members"]
    assert {"user_id", "name", "role"} <= result["members"][0].keys()
    slugs = {s["slug"] for s in result["statuses"]}
    assert {"to_do", "in_progress", "in_review", "done"} <= slugs
    assert {"slug", "name", "order"} <= result["statuses"][0].keys()


async def test_list_stories_returns_seeded_story(mcp_client, test_project, test_story):
    stories = await _list_stories_impl(mcp_client, test_project["id"])

    ids = [s["id"] for s in stories]
    assert test_story["id"] in ids


async def test_list_tasks_by_project(mcp_client, test_project, test_task):
    tasks = await _list_tasks_impl(mcp_client, test_project["id"])

    ids = [t["id"] for t in tasks]
    assert test_task["id"] in ids


async def test_list_tasks_by_story(mcp_client, test_project, test_story, test_task):
    tasks = await _list_tasks_impl(mcp_client, test_project["id"], story_id=test_story["id"])

    ids = [t["id"] for t in tasks]
    assert test_task["id"] in ids


async def test_list_tasks_unassigned_filter_project_scope(
    mcp_client, test_project, test_task, unassigned_task
):
    tasks = await _list_tasks_impl(mcp_client, test_project["id"], unassigned=True)

    ids = {t["id"] for t in tasks}
    assert unassigned_task["id"] in ids
    assert test_task["id"] not in ids


async def test_list_tasks_unassigned_filter_story_scope(
    mcp_client, test_project, test_story, test_task, unassigned_task
):
    tasks = await _list_tasks_impl(
        mcp_client, test_project["id"], story_id=test_story["id"], unassigned=True
    )

    ids = {t["id"] for t in tasks}
    assert unassigned_task["id"] in ids
    assert test_task["id"] not in ids


async def test_get_task_includes_comments(mcp_client, api_client, manager_headers, test_task):
    await api_client.post(
        f"/api/v1/tasks/{test_task['id']}/comments",
        json={"body": "hello from a comment"},
        headers=manager_headers,
    )

    result = await _get_task_impl(mcp_client, test_task["id"])

    assert result["id"] == test_task["id"]
    assert len(result["comments"]) == 1
    assert result["comments"][0]["body"] == "hello from a comment"


async def test_get_task_fetches_all_comment_pages(
    mcp_client, api_client, manager_headers, test_task
):
    """GET /tasks/{id}/comments defaults to a 25-item page; seed past that to prove
    get_task walks every page instead of silently truncating at page one."""
    total_comments = 30
    for i in range(total_comments):
        await api_client.post(
            f"/api/v1/tasks/{test_task['id']}/comments",
            json={"body": f"comment {i}"},
            headers=manager_headers,
        )

    result = await _get_task_impl(mcp_client, test_task["id"])

    assert len(result["comments"]) == total_comments


async def test_get_task_without_comments_omits_them(mcp_client, test_task):
    result = await _get_task_impl(mcp_client, test_task["id"], include_comments=False)

    assert result["id"] == test_task["id"]
    assert "comments" not in result


async def test_search_finds_task(mcp_client, test_task):
    results = await _search_impl(mcp_client, test_task["title"])

    ids = [r["id"] for r in results]
    assert test_task["id"] in ids


async def test_update_task_changes_status(mcp_write_client, test_task):
    result = await _update_task_impl(mcp_write_client, test_task["id"], status="in_progress")

    assert result["status"] == "in_progress"


async def test_update_task_no_fields_returns_error_without_http_call(
    mcp_write_client, api_client, manager_headers, test_task
):
    result = await _update_task_impl(mcp_write_client, test_task["id"])

    assert isinstance(result, str)
    assert "at least one" in result.lower() or "no fields" in result.lower()

    resp = await api_client.get(f"/api/v1/tasks/{test_task['id']}", headers=manager_headers)
    assert resp.json()["title"] == test_task["title"]
    assert resp.json()["status"] == test_task["status"]


async def test_update_task_invalid_status_surfaces_error(mcp_write_client, test_task):
    with pytest.raises(Exception):
        await _update_task_impl(mcp_write_client, test_task["id"], status="not-a-real-status")


async def test_add_comment_to_task(mcp_write_client, test_task):
    result = await _add_comment_impl(mcp_write_client, f"task:{test_task['id']}", "hi there")

    assert result["body"] == "hi there"


async def test_add_comment_to_story(mcp_write_client, test_story):
    result = await _add_comment_impl(mcp_write_client, f"story:{test_story['id']}", "hi story")

    assert result["body"] == "hi story"


async def test_add_comment_to_project(mcp_write_client, test_project):
    target = f"project:{test_project['id']}"
    result = await _add_comment_impl(mcp_write_client, target, "hi project")

    assert result["body"] == "hi project"


async def test_add_comment_malformed_target_returns_error_without_http_call(mcp_write_client):
    result = await _add_comment_impl(mcp_write_client, "bogus:123", "hi")

    assert isinstance(result, str)
    assert "invalid target" in result.lower()


async def test_add_comment_target_missing_colon_returns_error(mcp_write_client):
    result = await _add_comment_impl(mcp_write_client, "noprefix", "hi")

    assert isinstance(result, str)
    assert "invalid target" in result.lower()


async def test_create_task_under_project(mcp_write_client, test_project):
    result = await _create_task_impl(mcp_write_client, test_project["id"], "New Project Task")

    assert result["title"] == "New Project Task"
    assert result["project_id"] == test_project["id"]


async def test_create_task_under_story(mcp_write_client, test_project, test_story):
    result = await _create_task_impl(
        mcp_write_client,
        test_project["id"],
        "New Story Task",
        story_id=test_story["id"],
        priority="high",
        due_date="2026-12-01",
    )

    assert result["title"] == "New Story Task"
    assert result["story_id"] == test_story["id"]
    assert result["priority"] == "high"
    assert result["due_date"] == "2026-12-01"


async def test_create_story(mcp_write_client, test_project):
    result = await _create_story_impl(
        mcp_write_client, test_project["id"], "New Story", priority="medium"
    )

    assert result["title"] == "New Story"
    assert result["project_id"] == test_project["id"]
    assert result["priority"] == "medium"
