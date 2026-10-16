"""End-to-end: an agent identity acting through the MCP tool layer against the real API.

RBAC facts asserted here (read from the services, not assumed):
- Contributor may comment, update task status, create tasks and create stories.
- Delete/move need Manager but are JWT-only routes, so API-key agents cannot reach them.
- Agents can never run LLM capture (HUMAN_ONLY), whatever their project role.
"""

import asyncio

import httpx
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.main import app
from app.db.database import get_db
from app.mcp.client import SPTClient
from app.mcp.config import MCPConfig
from app.mcp.errors import SPTAPIError
from app.mcp.server import (
    _add_comment_impl,
    _capture_tasks_impl,
    _confirm_capture_impl,
    _create_story_impl,
    _create_task_impl,
    _get_project_impl,
    _list_comments_impl,
    _list_projects_impl,
    _update_task_impl,
    _whoami_impl,
)

API = "/api/v1"
AGENT_NAME = "mcp-flow-bot"
AGENT_SCOPES = [
    "read:projects",
    "read:stories",
    "read:tasks",
    "read:comments",
    "write:tasks",
    "write:comments",
    "write:stories",
]


class ExplodingLLM:
    """Capture must be refused before the LLM is reached; fail loudly if it is."""

    async def complete(self, *args, **kwargs):
        raise AssertionError("LLM must not be called for an agent")


@pytest_asyncio.fixture
async def project_b(api_client: AsyncClient, manager_headers: dict) -> dict:
    resp = await api_client.post(f"{API}/projects", json={"name": "B"}, headers=manager_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest_asyncio.fixture
async def project_task(api_client: AsyncClient, manager_headers: dict, test_story: dict) -> dict:
    resp = await api_client.post(
        f"{API}/stories/{test_story['id']}/tasks",
        json={"title": "Owner task"},
        headers=manager_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest_asyncio.fixture
async def agent_flow(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    test_project: dict,
    project_task: dict,
    project_b: dict,
):
    """Agent with a write-capable key, attached to project A (only) as Contributor."""
    created = await api_client.post(
        f"{API}/agents", json={"name": AGENT_NAME}, headers=manager_headers
    )
    assert created.status_code == 201, created.text
    agent = created.json()

    key = await api_client.post(
        f"{API}/agents/{agent['id']}/api-keys",
        json={"label": "mcp-flow", "scopes": AGENT_SCOPES},
        headers=manager_headers,
    )
    assert key.status_code == 201, key.text

    attached = await api_client.post(
        f"{API}/projects/{test_project['id']}/agents",
        json={"agent_id": agent["id"], "role": "contributor"},
        headers=manager_headers,
    )
    assert attached.status_code == 201, attached.text

    # get_project fans out concurrent requests that share one test DB session;
    # serialise access (same approach as test_mcp_tools.py).
    lock = asyncio.Lock()

    async def locked_get_db():
        async with lock:
            yield api_db

    app.dependency_overrides[get_db] = locked_get_db
    config = MCPConfig(
        api_url="http://test", api_key=key.json()["key"], locale="en-GB", timeout=30.0
    )
    client = SPTClient(config, transport=httpx.ASGITransport(app=app))
    yield {
        "client": client,
        "agent": agent,
        "key": key.json()["key"],
        "project": test_project,
        "task": project_task,
        "other_project": project_b,
    }
    await client.aclose()


async def test_whoami_reports_agent_identity_without_email(agent_flow):
    me = await _whoami_impl(agent_flow["client"])

    assert me["id"] == agent_flow["agent"]["id"]
    assert me["name"] == AGENT_NAME
    assert me["kind"] == "agent"
    assert not me.get("email")


async def test_agent_sees_only_its_attached_project(agent_flow):
    client = agent_flow["client"]

    projects = await _list_projects_impl(client)
    assert [p["id"] for p in projects] == [agent_flow["project"]["id"]]

    detail = await _get_project_impl(client, agent_flow["project"]["id"])
    assert any(m["name"] == AGENT_NAME for m in detail["members"])

    with pytest.raises(SPTAPIError) as excinfo:
        await _get_project_impl(client, agent_flow["other_project"]["id"])
    assert excinfo.value.status in (403, 404)


async def test_contributor_agent_can_comment_update_status_and_create(agent_flow):
    client = agent_flow["client"]
    task_id = agent_flow["task"]["id"]
    project_id = agent_flow["project"]["id"]

    await _add_comment_impl(client, f"task:{task_id}", "Looking into it")
    comments = await _list_comments_impl(client, f"task:{task_id}")
    assert [(c["body"], c["author_kind"], c["author_name"]) for c in comments] == [
        ("Looking into it", "agent", AGENT_NAME)
    ]

    updated = await _update_task_impl(client, task_id, status="in_progress")
    assert updated["status"] == "in_progress"

    # A Contributor may create tasks and stories; only deletes/moves need Manager.
    task = await _create_task_impl(client, project_id, "Agent task")
    assert task["created_by"] == agent_flow["agent"]["id"]
    story = await _create_story_impl(client, project_id, "Agent story")
    assert story["created_by"] == agent_flow["agent"]["id"]


async def test_promotion_is_visible_to_the_agent_through_get_project(
    agent_flow, api_client: AsyncClient, manager_headers: dict
):
    client = agent_flow["client"]
    project_id = agent_flow["project"]["id"]
    agent_id = agent_flow["agent"]["id"]

    def agent_role(detail: dict) -> str:
        return next(m["role"] for m in detail["members"] if m["user_id"] == agent_id)

    assert agent_role(await _get_project_impl(client, project_id)) == "contributor"

    promoted = await api_client.patch(
        f"{API}/projects/{project_id}/members/{agent_id}",
        json={"role": "manager"},
        headers=manager_headers,
    )
    assert promoted.status_code == 200, promoted.text

    # Same key, no re-auth: the role change takes effect immediately.
    assert agent_role(await _get_project_impl(client, project_id)) == "manager"


async def test_promoted_agent_creation_is_attributed_to_the_agent(
    agent_flow, api_client: AsyncClient, manager_headers: dict
):
    client = agent_flow["client"]
    project_id = agent_flow["project"]["id"]
    agent_id = agent_flow["agent"]["id"]
    promoted = await api_client.patch(
        f"{API}/projects/{project_id}/members/{agent_id}",
        json={"role": "manager"},
        headers=manager_headers,
    )
    assert promoted.status_code == 200, promoted.text

    task = await _create_task_impl(client, project_id, "Promoted agent task")

    assert task["created_by"] == agent_id
    history = await api_client.get(
        f"{API}/tasks/{task['id']}/status-history", headers=manager_headers
    )
    assert history.status_code == 200, history.text
    assert [(h["from_status"], h["changed_by"]) for h in history.json()] == [(None, agent_id)]


async def test_status_change_by_agent_is_recorded_in_history(
    agent_flow, api_client: AsyncClient, manager_headers: dict
):
    task_id = agent_flow["task"]["id"]

    await _update_task_impl(agent_flow["client"], task_id, status="done")

    history = await api_client.get(f"{API}/tasks/{task_id}/status-history", headers=manager_headers)
    last = history.json()[-1]
    assert (last["from_status"], last["to_status"]) == ("to_do", "done")
    assert last["changed_by"] == agent_flow["agent"]["id"]


async def test_agent_cannot_capture_or_confirm_capture(agent_flow, set_llm_client):
    set_llm_client(ExplodingLLM())
    client = agent_flow["client"]
    project_id = agent_flow["project"]["id"]

    with pytest.raises(SPTAPIError) as capture_err:
        await _capture_tasks_impl(client, project_id, "Fix the login bug")
    assert capture_err.value.status == 403
    assert "HUMAN_ONLY" in str(capture_err.value)

    with pytest.raises(SPTAPIError) as confirm_err:
        await _confirm_capture_impl(client, project_id, [{"title": "Fix the login bug"}])
    assert confirm_err.value.status == 403
    assert "HUMAN_ONLY" in str(confirm_err.value)


async def test_deactivated_agent_key_is_rejected_with_401(
    agent_flow, api_client: AsyncClient, manager_headers: dict
):
    client = agent_flow["client"]
    assert await _list_projects_impl(client)

    off = await api_client.post(
        f"{API}/agents/{agent_flow['agent']['id']}/deactivate", headers=manager_headers
    )
    assert off.status_code == 204

    with pytest.raises(SPTAPIError) as excinfo:
        await _list_projects_impl(client)
    assert excinfo.value.status == 401
