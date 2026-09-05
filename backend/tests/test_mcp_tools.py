import asyncio
import json
import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.main import app
from app.api.schemas.api_key import APIKeyCreate
from app.api.services import config_service
from app.core.llm.base import LLMResponse
from app.db.database import get_db
from app.db.models import User
from app.mcp.client import SPTClient
from app.mcp.config import MCPConfig
from app.mcp.server import (
    _add_comment_impl,
    _capture_tasks_impl,
    _confirm_capture_impl,
    _create_story_impl,
    _create_task_impl,
    _get_project_impl,
    _get_task_impl,
    _list_projects_impl,
    _list_stories_impl,
    _list_tasks_impl,
    _project_resource_impl,
    _projects_resource_impl,
    _search_impl,
    _update_task_impl,
    _work_on_task_prompt_impl,
    mcp,
)


class FakeLLMClient:
    """Test double returning canned raw text - avoids a real LLM call. Mirrors the one in
    test_api_capture.py."""

    def __init__(self, responses):
        self.calls = []
        self._responses = responses if isinstance(responses, list) else [responses]

    async def complete(self, system, user, *, json_schema=None, max_tokens, temperature):
        self.calls.append({"system": system, "user": user})
        idx = min(len(self.calls) - 1, len(self._responses) - 1)
        text, model = self._responses[idx]
        return LLMResponse(
            text=text, model=model, prompt_tokens=1, completion_tokens=1, latency_ms=1
        )


def _extraction_json(tasks: list[dict], not_a_task: bool = False, notes: str | None = None) -> str:
    return json.dumps({"tasks": tasks, "not_a_task": not_a_task, "notes": notes})


def _extracted_task(
    title="Fix the login bug",
    description=None,
    story_hint=None,
    assignee_hint=None,
    due_date=None,
    priority=None,
    confidence=0.9,
) -> dict:
    return {
        "title": title,
        "description": description,
        "story_hint": story_hint,
        "assignee_hint": assignee_hint,
        "due_date": due_date,
        "priority": priority,
        "confidence": confidence,
    }


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
async def mcp_read_only_client(api_client: AsyncClient, api_db: AsyncSession, manager_user: User):
    """API key scoped to read:tasks only (no write:tasks) - for scope-enforcement tests."""
    client = await _make_mcp_client(api_db, manager_user, "mcp-read-only-test-key", ["read:tasks"])
    yield client
    await client.aclose()


@pytest_asyncio.fixture
async def other_project(api_client: AsyncClient, global_manager_headers: dict) -> dict:
    """A project owned by a manager the mcp_client/mcp_write_client user is not a member of."""
    resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "Other Manager's Project"},
        headers=global_manager_headers,
    )
    return resp.json()


@pytest_asyncio.fixture
async def demo_user(api_client: AsyncClient, api_db: AsyncSession) -> User:
    """Register a user and mark is_demo=True, mirroring test_demo_account.py's demo_headers."""
    email = f"mcp_demo_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Demo User", "password": "testpassword123"},
        )
    await api_db.execute(
        update(User).where(User.email == email).values(email_confirmed=True, is_demo=True)
    )
    await api_db.flush()
    return (await api_db.scalars(select(User).where(User.email == email))).one()


@pytest_asyncio.fixture
async def mcp_demo_write_client(api_db: AsyncSession, demo_user: User):
    """Demo-account API key with write scope - proves require_not_demo runs through the
    HTTP path even when the scope check itself passes."""
    client = await _make_mcp_client(
        api_db, demo_user, "mcp-demo-test-key", ["write:projects", "write:stories", "write:tasks"]
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
    with pytest.raises(Exception) as exc_info:
        await _update_task_impl(mcp_write_client, test_task["id"], status="not-a-real-status")

    assert "not-a-real-status" in str(exc_info.value)


async def test_update_task_insufficient_scope_surfaces_error(mcp_read_only_client, test_task):
    """A read:tasks-only key hits require_scope("write:tasks") before the service layer
    even runs - proves the route-level scope dependency is reachable via MCP too."""
    with pytest.raises(Exception) as exc_info:
        await _update_task_impl(mcp_read_only_client, test_task["id"], status="in_progress")

    assert "INSUFFICIENT_SCOPE" in str(exc_info.value)


async def test_get_project_not_a_member_surfaces_forbidden_error(mcp_client, other_project):
    """require_project_access raises detail="Not a project member" (not a literal
    "FORBIDDEN" code - verified against app/auth/permissions.py) when the key's owner
    has no ProjectMember row and doesn't own the project."""
    with pytest.raises(Exception) as exc_info:
        await _get_project_impl(mcp_client, other_project["id"])

    assert "not a project member" in str(exc_info.value).lower()


async def test_list_tasks_not_a_member_surfaces_forbidden_error(mcp_client, other_project):
    with pytest.raises(Exception) as exc_info:
        await _list_tasks_impl(mcp_client, other_project["id"])

    assert "not a project member" in str(exc_info.value).lower()


async def test_create_task_demo_account_blocked(mcp_demo_write_client, test_project):
    """Demo accounts are rejected by require_not_demo before require_project_access runs
    (see app/api/services/task_service.py), so this fires even though the demo user isn't
    a member of test_project."""
    with pytest.raises(Exception) as exc_info:
        await _create_task_impl(mcp_demo_write_client, test_project["id"], "Should not be created")

    assert "DEMO_ACCOUNT" in str(exc_info.value)


async def test_list_tasks_project_scope_includes_all_stories_story_scope_is_narrower(
    mcp_client, mcp_write_client, test_project, test_story, test_task
):
    """Project-scoped list_tasks hits /projects/{id}/tasks and returns every task under the
    project regardless of story; story-scoped list_tasks hits /stories/{id}/tasks and is
    narrower - a task created without story_id (attached to the default Backlog story)
    proves the two routes aren't interchangeable."""
    backlog_task = await _create_task_impl(mcp_write_client, test_project["id"], "Backlog Task")

    project_tasks = await _list_tasks_impl(mcp_client, test_project["id"])
    story_tasks = await _list_tasks_impl(mcp_client, test_project["id"], story_id=test_story["id"])

    project_ids = {t["id"] for t in project_tasks}
    story_ids = {t["id"] for t in story_tasks}

    assert {test_task["id"], backlog_task["id"]} <= project_ids
    assert test_task["id"] in story_ids
    assert backlog_task["id"] not in story_ids


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


async def test_capture_tasks_returns_preview_without_creating(
    mcp_write_client, api_client, manager_headers, test_project, set_llm_client
):
    set_llm_client(FakeLLMClient((_extraction_json([_extracted_task()]), "gemini-3.6-flash")))

    result = await _capture_tasks_impl(mcp_write_client, test_project["id"], "Fix the login bug")

    assert result["needs_confirmation"] is True
    assert result["unparseable"] is False
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["title"] == "Fix the login bug"

    resp = await api_client.get(
        f"/api/v1/projects/{test_project['id']}/tasks", headers=manager_headers
    )
    assert resp.json()["items"] == []


async def test_capture_tasks_defaults_reference_date_to_today(
    mcp_write_client, test_project, set_llm_client
):
    fake = set_llm_client(
        FakeLLMClient((_extraction_json([_extracted_task()]), "gemini-3.6-flash"))
    )

    result = await _capture_tasks_impl(mcp_write_client, test_project["id"], "Fix the login bug")

    assert result["unparseable"] is False
    assert date.today().isoformat() in fake.calls[0]["user"]


async def test_confirm_capture_creates_tasks(
    mcp_write_client, api_client, manager_headers, test_project
):
    result = await _confirm_capture_impl(
        mcp_write_client,
        test_project["id"],
        [{"title": "Fix the login bug"}, {"title": "Write the changelog"}],
    )

    created_titles = {t["title"] for t in result["created"]}
    assert created_titles == {"Fix the login bug", "Write the changelog"}

    resp = await api_client.get(
        f"/api/v1/projects/{test_project['id']}/tasks", headers=manager_headers
    )
    titles = {t["title"] for t in resp.json()["items"]}
    assert {"Fix the login bug", "Write the changelog"} <= titles


async def test_confirm_capture_accepts_unmodified_preview_items(
    mcp_write_client, api_client, manager_headers, test_project, set_llm_client
):
    """capture_tasks' own docstring invites passing its (possibly edited) preview items
    straight to confirm_capture. Preview items carry extra fields (story_hint, confidence,
    etc.) that the confirm schema forbids - confirm_capture must strip them itself rather
    than requiring the caller to hand-reconstruct a minimal object."""
    set_llm_client(FakeLLMClient((_extraction_json([_extracted_task()]), "gemini-3.6-flash")))

    preview = await _capture_tasks_impl(mcp_write_client, test_project["id"], "Fix the login bug")
    assert preview["tasks"], "preview must return at least one task for this test to be meaningful"

    result = await _confirm_capture_impl(mcp_write_client, test_project["id"], preview["tasks"])

    assert [t["title"] for t in result["created"]] == ["Fix the login bug"]

    resp = await api_client.get(
        f"/api/v1/projects/{test_project['id']}/tasks", headers=manager_headers
    )
    titles = {t["title"] for t in resp.json()["items"]}
    assert "Fix the login bug" in titles


async def test_projects_resource_matches_list_projects_output(mcp_client, test_project):
    resource_result = await _projects_resource_impl(mcp_client)
    tool_result = await _list_projects_impl(mcp_client)

    assert resource_result == tool_result
    ids = [p["id"] for p in resource_result]
    assert test_project["id"] in ids


async def test_project_resource_matches_get_project_output(mcp_client, test_project):
    resource_result = await _project_resource_impl(mcp_client, test_project["id"])
    tool_result = await _get_project_impl(mcp_client, test_project["id"])

    assert resource_result == tool_result
    assert resource_result["project"]["id"] == test_project["id"]


async def test_project_resource_not_a_member_surfaces_forbidden_error(mcp_client, other_project):
    with pytest.raises(Exception) as exc_info:
        await _project_resource_impl(mcp_client, other_project["id"])

    assert "not a project member" in str(exc_info.value).lower()


async def test_work_on_task_prompt_includes_ticket_comments_and_statuses(
    mcp_client, api_client, manager_headers, test_task
):
    await api_client.post(
        f"/api/v1/tasks/{test_task['id']}/comments",
        json={"body": "please prioritize this"},
        headers=manager_headers,
    )

    prompt_text = await _work_on_task_prompt_impl(mcp_client, test_task["id"])

    assert isinstance(prompt_text, str)
    assert test_task["title"] in prompt_text
    assert test_task["status"] in prompt_text
    assert test_task["priority"] in prompt_text
    assert "please prioritize this" in prompt_text
    assert "to_do" in prompt_text and "in_progress" in prompt_text
    assert "move it forward" in prompt_text.lower()


async def test_work_on_task_prompt_no_comments_says_so(mcp_client, test_task):
    prompt_text = await _work_on_task_prompt_impl(mcp_client, test_task["id"])

    assert "no comments yet" in prompt_text.lower()


async def test_registered_resources_match_expected_set_exactly():
    """FastMCP registers a zero-param `spt://projects` resource as a plain resource, and
    `spt://projects/{project_id}` as a resource template (it has a URI parameter) - see
    ResourceManager.list_resources / list_templates."""
    resources = await mcp.list_resources()
    templates = await mcp.list_resource_templates()

    assert {str(r.uri) for r in resources} == {"spt://projects"}
    assert {t.uriTemplate for t in templates} == {"spt://projects/{project_id}"}


async def test_registered_prompts_match_expected_set_exactly():
    prompts = await mcp.list_prompts()

    assert {p.name for p in prompts} == {"work_on_task"}


EXPECTED_TOOL_NAMES = {
    "whoami",
    "list_projects",
    "get_project",
    "list_stories",
    "list_tasks",
    "get_task",
    "search",
    "update_task",
    "add_comment",
    "create_task",
    "create_story",
    "capture_tasks",
    "confirm_capture",
}


async def test_registered_tools_match_expected_set_exactly():
    tools = await mcp.list_tools()

    assert {t.name for t in tools} == EXPECTED_TOOL_NAMES


async def test_registered_tools_all_have_descriptions():
    tools = await mcp.list_tools()

    assert len(tools) == len(EXPECTED_TOOL_NAMES)
    for tool in tools:
        assert tool.description and tool.description.strip(), f"{tool.name} has no description"
