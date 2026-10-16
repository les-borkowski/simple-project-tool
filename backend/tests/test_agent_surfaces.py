"""Actor kind surfaced in comments, CLI, MCP and the admin panel."""

import re
import uuid
from unittest.mock import AsyncMock, patch

from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from typer.testing import CliRunner

from app.admin.services import get_totals, get_weekly_trends
from app.admin.users_service import get_all_users
from app.core.config import settings
from app.db.models import User
from app.mcp.server import _whoami_impl
from tests.helpers import make_agent
from tests.test_api_agents import API, attach, create_agent
from tests.test_cli_commands import make_resp, mock_config

runner = CliRunner()

COMMENT_SCOPES = ["read:projects", "read:tasks", "read:comments", "write:comments"]


async def _agent_key_headers(
    client: AsyncClient, owner_headers: dict, project_id: str
) -> tuple[dict, dict]:
    agent = (await create_agent(client, owner_headers)).json()
    attached = await attach(client, owner_headers, project_id, agent["id"], "manager")
    assert attached.status_code == 201, attached.text
    minted = await client.post(
        f"{API}/agents/{agent['id']}/api-keys",
        json={"label": "c", "scopes": COMMENT_SCOPES},
        headers=owner_headers,
    )
    assert minted.status_code == 201, minted.text
    return agent, {"X-API-Key": minted.json()["key"]}


async def _post_and_list_task_comment(client: AsyncClient, headers: dict, task_id: str):
    posted = await client.post(
        f"{API}/tasks/{task_id}/comments", json={"body": "hello"}, headers=headers
    )
    assert posted.status_code == 201, posted.text
    listed = await client.get(f"{API}/tasks/{task_id}/comments", headers=headers)
    assert listed.status_code == 200, listed.text
    return posted.json(), listed.json()["items"]


async def _make_task(client: AsyncClient, headers: dict, project_id: str) -> str:
    resp = await client.post(
        f"{API}/projects/{project_id}/tasks", json={"title": "T"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# --- comments ---


async def test_comment_by_agent_has_author_kind_agent(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    agent, key = await _agent_key_headers(api_client, manager_headers, test_project["id"])
    task_id = await _make_task(api_client, manager_headers, test_project["id"])

    posted, items = await _post_and_list_task_comment(api_client, key, task_id)

    assert posted["author_kind"] == "agent"
    assert posted["author_name"] == agent["name"]
    assert [c["author_kind"] for c in items] == ["agent"]
    assert items[0]["author_name"] == agent["name"]


async def test_comment_by_human_has_author_kind_human(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    task_id = await _make_task(api_client, manager_headers, test_project["id"])

    posted, items = await _post_and_list_task_comment(api_client, manager_headers, task_id)

    assert posted["author_kind"] == "human"
    assert [c["author_kind"] for c in items] == ["human"]


# --- CLI ---


def test_cli_members_table_renders_missing_email(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {
        "items": [
            {
                "user_id": "u-uuid-1234",
                "name": "Botty",
                "email": None,
                "kind": "agent",
                "role": "contributor",
            }
        ],
        "next_cursor": None,
    }
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["projects", "members", "proj-1"])

    assert result.exit_code == 0, result.output
    assert "Botty" in result.output
    assert " - " in result.output.replace("│", " ")


def test_cli_whoami_tolerates_missing_email(tmp_path):
    from app.cli.main import app

    p = mock_config(tmp_path)
    data = {"id": "u1", "name": "Botty", "role": "contributor", "kind": "agent"}
    with patch("app.cli.config.CONFIG_PATH", p):
        with patch("httpx.Client.request", return_value=make_resp(200, data)):
            result = runner.invoke(app, ["auth", "whoami"])

    assert result.exit_code == 0, result.output
    assert "Botty" in result.output


# --- MCP ---


async def test_mcp_whoami_passes_through_agent_kind():
    payload = {"id": "a1", "name": "Botty", "email": None, "kind": "agent", "role": "contributor"}
    client = AsyncMock()
    client.get.return_value = payload

    result = await _whoami_impl(client)

    assert result == payload
    assert result["kind"] == "agent"


# --- admin panel ---


def _owner_name(user) -> str | None:
    """Owner name as the service exposes it: an `owner_name` attribute or a loaded `owner`."""
    name = getattr(user, "owner_name", None)
    if name is not None:
        return name
    owner = getattr(user, "owner", None)
    return owner.name if owner is not None else None


async def _human(db: AsyncSession, name: str, confirmed: bool = True) -> User:
    user = User(
        email=f"own_{uuid.uuid4().hex[:8]}@example.com",
        name=name,
        password_hash="x",
        email_confirmed=confirmed,
    )
    db.add(user)
    await db.flush()
    return user


async def _admin_login(client: AsyncClient) -> None:
    await client.post(
        "/admin/login",
        data={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_PASSWORD},
    )


def _row_for(html: str, user_id) -> str:
    rows = re.findall(r"<tr>.*?</tr>", html, flags=re.S)
    return next(r for r in rows if str(user_id) in r)


async def test_admin_user_list_marks_agents(api_client: AsyncClient, api_db: AsyncSession):
    suffix = uuid.uuid4().hex[:6]
    owner = await _human(api_db, f"Olivia{suffix}", confirmed=False)
    agent = await make_agent(api_db, owner, name=f"robot{suffix}")
    # Unverified so a verify action would show if the template did not skip agents.
    agent.email_confirmed = False
    await api_db.flush()
    await _admin_login(api_client)

    resp = await api_client.get("/admin/users")

    assert resp.status_code == 200
    agent_row = _row_for(resp.text, agent.id)
    human_row = _row_for(resp.text, owner.id)
    assert "Bot" in agent_row
    assert owner.name in agent_row
    cells = re.findall(r"<td>(.*?)</td>", agent_row, flags=re.S)
    assert cells[1].strip() == "—"
    assert "None" not in agent_row
    for action in ("reset-password", "enable-demo", "disable-demo", "verify"):
        assert f"/{agent.id}/{action}" not in agent_row
    for action in ("block", "delete"):
        assert f"/{agent.id}/{action}" in agent_row
    assert "Bot" not in human_row
    for action in ("reset-password", "enable-demo", "verify", "block", "delete"):
        assert f"/{owner.id}/{action}" in human_row


async def test_admin_service_returns_owner_names_without_n_plus_one(engine, db: AsyncSession):
    owner = await _human(db, "Owen")
    first = await make_agent(db, owner, name="a1")

    async def listing_statements() -> int:
        count = 0

        def on_execute(*_args):
            nonlocal count
            count += 1

        event.listen(engine.sync_engine, "before_cursor_execute", on_execute)
        try:
            for u in await get_all_users(db):
                _owner_name(u)
        finally:
            event.remove(engine.sync_engine, "before_cursor_execute", on_execute)
        return count

    db.expire_all()
    baseline = await listing_statements()
    for i in range(4):
        await make_agent(db, owner, name=f"extra{i}")
    db.expire_all()
    many = await listing_statements()

    users = {u.id: u for u in await get_all_users(db)}
    assert _owner_name(users[first.id]) == "Owen"
    assert _owner_name(users[owner.id]) is None
    assert many == baseline


# --- dashboard counts ---


async def test_dashboard_totals_and_trends_exclude_agents(db: AsyncSession):
    owner = await _human(db, "Counted")
    before_totals = await get_totals(db)
    before_trends = await get_weekly_trends(db)

    await make_agent(db, owner, name="a1")
    await make_agent(db, owner, name="a2")

    assert (await get_totals(db))["users"] == before_totals["users"]
    assert (await get_weekly_trends(db))["users"] == before_trends["users"]
