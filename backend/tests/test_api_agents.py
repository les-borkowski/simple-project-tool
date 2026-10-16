"""Agent management API (/agents) and attaching agents to projects."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.api_key import APIKeyCreate
from app.api.schemas.project import MemberAdd, ProjectUpdate
from app.api.services import config_service, project_service
from app.db.base import RoleEnum
from app.db.models import User
from tests.helpers import make_agent

API = "/api/v1"
DEFAULT_SCOPES = ["read:projects", "read:stories", "read:tasks", "read:comments"]


async def make_human(
    client: AsyncClient, db: AsyncSession, *, demo: bool = False
) -> tuple[dict, str]:
    """Register a confirmed human; return (bearer headers, user id)."""
    email = f"human_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await client.post(
            f"{API}/auth/register",
            json={"email": email, "name": "Human", "password": "testpassword123"},
        )
    await db.execute(
        update(User).where(User.email == email).values(email_confirmed=True, is_demo=demo)
    )
    await db.flush()
    login = await client.post(
        f"{API}/auth/login", json={"email": email, "password": "testpassword123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = await client.get(f"{API}/auth/me", headers=headers)
    return headers, me.json()["id"]


def agent_name() -> str:
    return f"bot-{uuid.uuid4().hex[:8]}"


async def create_agent(client: AsyncClient, headers: dict, name: str | None = None, **extra):
    return await client.post(
        f"{API}/agents", json={"name": name or agent_name(), **extra}, headers=headers
    )


async def create_project(client: AsyncClient, headers: dict, name: str = "P") -> dict:
    resp = await client.post(f"{API}/projects", json={"name": name}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def attach(client: AsyncClient, headers: dict, project_id: str, agent_id: str, role: str):
    return await client.post(
        f"{API}/projects/{project_id}/agents",
        json={"agent_id": agent_id, "role": role},
        headers=headers,
    )


@pytest_asyncio.fixture
async def other_headers(api_client: AsyncClient, api_db: AsyncSession) -> dict:
    headers, _ = await make_human(api_client, api_db)
    return headers


@pytest_asyncio.fixture
async def agent(api_client: AsyncClient, manager_headers: dict) -> dict:
    resp = await create_agent(api_client, manager_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_create_agent_returns_key_once(api_client: AsyncClient, manager_headers: dict):
    name = agent_name()
    resp = await create_agent(api_client, manager_headers, name)

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == name
    assert body["is_active"] is True
    assert body["key_count"] == 1
    assert body["key"]["key"]
    assert body["key"]["scopes"] == DEFAULT_SCOPES

    listed = await api_client.get(f"{API}/agents", headers=manager_headers)
    assert listed.status_code == 200
    row = next(a for a in listed.json() if a["id"] == body["id"])
    assert "key" not in row
    assert row["key_count"] == 1

    keys = await api_client.get(f"{API}/agents/{body['id']}/api-keys", headers=manager_headers)
    assert keys.status_code == 200
    assert body["key"]["key"] not in keys.text


async def test_duplicate_name_same_owner_409_case_insensitive(
    api_client: AsyncClient, manager_headers: dict, other_headers: dict
):
    name = agent_name()
    assert (await create_agent(api_client, manager_headers, name)).status_code == 201

    dup = await create_agent(api_client, manager_headers, name.upper())
    assert dup.status_code == 409
    assert dup.json()["error"]["code"] == "AGENT_NAME_TAKEN"

    # A different owner may reuse the name.
    assert (await create_agent(api_client, other_headers, name)).status_code == 201


async def test_limit_reached_returns_409_agent_limit(
    api_client: AsyncClient, manager_headers: dict, monkeypatch
):
    monkeypatch.setattr("app.core.config.settings.MAX_AGENTS_PER_USER", 2)
    assert (await create_agent(api_client, manager_headers)).status_code == 201
    assert (await create_agent(api_client, manager_headers)).status_code == 201

    third = await create_agent(api_client, manager_headers)

    assert third.status_code == 409
    assert third.json()["error"]["code"] == "AGENT_LIMIT_REACHED"


async def test_deactivated_agents_count_toward_limit(
    api_client: AsyncClient, manager_headers: dict, monkeypatch
):
    monkeypatch.setattr("app.core.config.settings.MAX_AGENTS_PER_USER", 2)
    first = (await create_agent(api_client, manager_headers)).json()
    assert (await create_agent(api_client, manager_headers)).status_code == 201
    off = await api_client.post(f"{API}/agents/{first['id']}/deactivate", headers=manager_headers)
    assert off.status_code == 204

    resp = await create_agent(api_client, manager_headers)

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "AGENT_LIMIT_REACHED"


async def test_agent_key_acts_as_agent(api_client: AsyncClient, manager_headers: dict):
    name = agent_name()
    created = (await create_agent(api_client, manager_headers, name)).json()

    me = await api_client.get(f"{API}/auth/me", headers={"X-API-Key": created["key"]["key"]})

    assert me.status_code == 200
    assert me.json()["id"] == created["id"]
    assert me.json()["name"] == name
    assert me.json()["kind"] == "agent"


async def test_agents_endpoints_reject_api_key_and_agents(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    human_key = await api_client.post(
        f"{API}/config/api-keys",
        json={"label": "h", "scopes": ["read:projects"]},
        headers=manager_headers,
    )
    assert human_key.status_code == 201, human_key.text

    for key in (human_key.json()["key"], agent["key"]["key"]):
        resp = await api_client.post(
            f"{API}/agents", json={"name": agent_name()}, headers={"X-API-Key": key}
        )
        assert resp.status_code in (401, 403)


async def test_other_owner_gets_404_on_manage(
    api_client: AsyncClient, other_headers: dict, agent: dict
):
    aid = agent["id"]
    calls = [
        api_client.patch(f"{API}/agents/{aid}", json={"name": "hijack"}, headers=other_headers),
        api_client.post(f"{API}/agents/{aid}/deactivate", headers=other_headers),
        api_client.post(f"{API}/agents/{aid}/reactivate", headers=other_headers),
        api_client.get(f"{API}/agents/{aid}/api-keys", headers=other_headers),
    ]
    for call in calls:
        resp = await call
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "Agent not found"


async def test_deactivate_revokes_keys_and_blocks(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    key = {"X-API-Key": agent["key"]["key"]}
    assert (await api_client.get(f"{API}/projects", headers=key)).status_code == 200

    off = await api_client.post(f"{API}/agents/{agent['id']}/deactivate", headers=manager_headers)
    assert off.status_code == 204

    after = await api_client.get(f"{API}/projects", headers=key)
    # Keys are revoked on deactivation, so the key itself no longer resolves.
    assert after.status_code == 401
    listed = await api_client.get(f"{API}/agents", headers=manager_headers)
    row = next(a for a in listed.json() if a["id"] == agent["id"])
    assert row["is_active"] is False
    assert row["key_count"] == 0


async def test_reactivate_does_not_restore_keys(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    key = {"X-API-Key": agent["key"]["key"]}
    await api_client.post(f"{API}/agents/{agent['id']}/deactivate", headers=manager_headers)

    on = await api_client.post(f"{API}/agents/{agent['id']}/reactivate", headers=manager_headers)

    assert on.status_code == 200
    assert on.json()["is_active"] is True
    assert on.json()["key_count"] == 0
    assert (await api_client.get(f"{API}/projects", headers=key)).status_code == 401

    minted = await api_client.post(
        f"{API}/agents/{agent['id']}/api-keys",
        json={"label": "new", "scopes": ["read:projects"]},
        headers=manager_headers,
    )
    assert minted.status_code == 201
    new_key = {"X-API-Key": minted.json()["key"]}
    assert (await api_client.get(f"{API}/projects", headers=new_key)).status_code == 200


async def test_attach_requires_owner_and_project_manager(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict
):
    owner_headers, owner_id = await make_human(api_client, api_db)
    own_agent = (await create_agent(api_client, owner_headers)).json()
    project = await create_project(api_client, manager_headers)
    added = await api_client.post(
        f"{API}/projects/{project['id']}/members",
        json={"user_id": owner_id, "role": "contributor"},
        headers=manager_headers,
    )
    assert added.status_code == 201, added.text

    # The project manager does not own the agent.
    not_owner = await attach(
        api_client, manager_headers, project["id"], own_agent["id"], "contributor"
    )
    assert not_owner.status_code == 404
    assert not_owner.json()["error"]["code"] == "Agent not found"

    # The owner is only a Contributor on the project.
    contributor = await attach(
        api_client, owner_headers, project["id"], own_agent["id"], "contributor"
    )
    assert contributor.status_code == 403

    promoted = await api_client.patch(
        f"{API}/projects/{project['id']}/members/{owner_id}",
        json={"role": "manager"},
        headers=manager_headers,
    )
    assert promoted.status_code == 200, promoted.text
    attached = await attach(api_client, owner_headers, project["id"], own_agent["id"], "manager")
    assert attached.status_code == 201, attached.text
    assert attached.json()["user_id"] == own_agent["id"]
    assert attached.json()["role"] == "manager"


async def test_attached_agent_sees_only_its_projects(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    mine = await create_project(api_client, manager_headers, "Mine")
    other = await create_project(api_client, manager_headers, "Other")
    resp = await attach(api_client, manager_headers, mine["id"], agent["id"], "contributor")
    assert resp.status_code == 201, resp.text
    key = {"X-API-Key": agent["key"]["key"]}

    listed = await api_client.get(f"{API}/projects", headers=key)

    assert listed.status_code == 200
    assert [p["id"] for p in listed.json()["items"]] == [mine["id"]]
    direct = await api_client.get(f"{API}/projects/{other['id']}", headers=key)
    assert direct.status_code in (403, 404)


async def test_attach_twice_409(api_client: AsyncClient, manager_headers: dict, agent: dict):
    project = await create_project(api_client, manager_headers)
    first = await attach(api_client, manager_headers, project["id"], agent["id"], "contributor")
    assert first.status_code == 201, first.text

    again = await attach(api_client, manager_headers, project["id"], agent["id"], "contributor")

    assert again.status_code == 409


async def test_agent_comment_and_status_change_attributed(
    api_client: AsyncClient, manager_headers: dict
):
    name = agent_name()
    scopes = [*DEFAULT_SCOPES, "write:comments", "write:tasks"]
    created = (await create_agent(api_client, manager_headers, name, scopes=scopes)).json()
    project = await create_project(api_client, manager_headers)
    resp = await attach(api_client, manager_headers, project["id"], created["id"], "manager")
    assert resp.status_code == 201, resp.text
    task = await api_client.post(
        f"{API}/projects/{project['id']}/tasks", json={"title": "T"}, headers=manager_headers
    )
    task_id = task.json()["id"]
    key = {"X-API-Key": created["key"]["key"]}

    comment = await api_client.post(
        f"{API}/tasks/{task_id}/comments", json={"body": "from the bot"}, headers=key
    )
    patched = await api_client.patch(
        f"{API}/tasks/{task_id}", json={"status": "in_progress"}, headers=key
    )

    assert comment.status_code == 201, comment.text
    assert comment.json()["author_id"] == created["id"]
    assert comment.json()["author_name"] == name
    assert patched.status_code == 200, patched.text
    history = await api_client.get(f"{API}/tasks/{task_id}/status-history", headers=manager_headers)
    assert history.status_code == 200
    assert created["id"] in {h["changed_by"] for h in history.json()}


async def test_member_list_shows_agent_with_null_email_and_kind(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    project = await create_project(api_client, manager_headers)
    resp = await attach(api_client, manager_headers, project["id"], agent["id"], "contributor")
    assert resp.status_code == 201, resp.text

    members = await api_client.get(
        f"{API}/projects/{project['id']}/members", headers=manager_headers
    )

    assert members.status_code == 200
    by_id = {m["user_id"]: m for m in members.json()}
    assert by_id[agent["id"]]["email"] is None
    assert by_id[agent["id"]]["kind"] == "agent"
    assert by_id[agent["id"]]["name"] == agent["name"]
    humans = [m for m in members.json() if m["user_id"] != agent["id"]]
    assert humans and all(m["kind"] == "human" for m in humans)


async def test_demo_owner_cannot_create_agent(api_client: AsyncClient, api_db: AsyncSession):
    demo_headers, _ = await make_human(api_client, api_db, demo=True)

    resp = await create_agent(api_client, demo_headers)

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "DEMO_ACCOUNT"


async def test_old_add_member_rejects_agent_user_id(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    project = await create_project(api_client, manager_headers)

    resp = await api_client.post(
        f"{API}/projects/{project['id']}/members",
        json={"user_id": agent["id"], "role": "contributor"},
        headers=manager_headers,
    )

    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "User not found"


async def test_inactive_agent_cannot_be_attached(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    project = await create_project(api_client, manager_headers)
    await api_client.post(f"{API}/agents/{agent['id']}/deactivate", headers=manager_headers)

    resp = await attach(api_client, manager_headers, project["id"], agent["id"], "contributor")

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "AGENT_INACTIVE"


async def test_no_delete_agent_endpoint(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    resp = await api_client.delete(f"{API}/agents/{agent['id']}", headers=manager_headers)

    assert resp.status_code in (404, 405)


async def test_revoke_agent_key_unknown_key_404(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    resp = await api_client.delete(
        f"{API}/agents/{agent['id']}/api-keys/{uuid.uuid4()}", headers=manager_headers
    )

    assert resp.status_code == 404


async def add_manager(client: AsyncClient, headers: dict, project_id: str, user_id: str):
    resp = await client.post(
        f"{API}/projects/{project_id}/members",
        json={"user_id": user_id, "role": "manager"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text


async def owner_with_attached_agent(
    client: AsyncClient, db: AsyncSession, manager_headers: dict
) -> tuple[dict, str, dict, dict]:
    """Project run by manager_headers; a second manager owns an agent attached as manager."""
    project = await create_project(client, manager_headers)
    owner_headers, owner_id = await make_human(client, db)
    await add_manager(client, manager_headers, project["id"], owner_id)
    created = (await create_agent(client, owner_headers)).json()
    resp = await attach(client, owner_headers, project["id"], created["id"], "manager")
    assert resp.status_code == 201, resp.text
    return owner_headers, owner_id, created, project


async def test_non_owner_manager_cannot_change_agent_role_but_can_remove(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict
):
    owner_headers, _, created, project = await owner_with_attached_agent(
        api_client, api_db, manager_headers
    )
    url = f"{API}/projects/{project['id']}/members/{created['id']}"

    other = await api_client.patch(url, json={"role": "contributor"}, headers=manager_headers)
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "Agent not found"

    own = await api_client.patch(url, json={"role": "contributor"}, headers=owner_headers)
    assert own.status_code == 200, own.text
    assert own.json()["role"] == "contributor"

    removed = await api_client.delete(url, headers=manager_headers)
    assert removed.status_code == 204


async def test_removing_owner_removes_their_agents(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict
):
    _, owner_id, created, project = await owner_with_attached_agent(
        api_client, api_db, manager_headers
    )
    key = {"X-API-Key": created["key"]["key"]}
    assert (await api_client.get(f"{API}/projects/{project['id']}", headers=key)).status_code == 200

    removed = await api_client.delete(
        f"{API}/projects/{project['id']}/members/{owner_id}", headers=manager_headers
    )
    assert removed.status_code == 204

    members = await api_client.get(
        f"{API}/projects/{project['id']}/members", headers=manager_headers
    )
    assert created["id"] not in {m["user_id"] for m in members.json()}
    after = await api_client.get(f"{API}/projects/{project['id']}", headers=key)
    assert after.status_code in (403, 404)


async def test_demoting_owner_demotes_their_agents(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict
):
    _, owner_id, created, project = await owner_with_attached_agent(
        api_client, api_db, manager_headers
    )

    demoted = await api_client.patch(
        f"{API}/projects/{project['id']}/members/{owner_id}",
        json={"role": "contributor"},
        headers=manager_headers,
    )
    assert demoted.status_code == 200, demoted.text

    members = await api_client.get(
        f"{API}/projects/{project['id']}/members", headers=manager_headers
    )
    by_id = {m["user_id"]: m for m in members.json()}
    assert by_id[created["id"]]["role"] == "contributor"


async def test_key_endpoints_404_for_other_owners_agent(
    api_client: AsyncClient, other_headers: dict, agent: dict
):
    minted = await api_client.post(
        f"{API}/agents/{agent['id']}/api-keys",
        json={"label": "x", "scopes": ["read:projects"]},
        headers=other_headers,
    )
    revoked = await api_client.delete(
        f"{API}/agents/{agent['id']}/api-keys/{agent['key']['id']}", headers=other_headers
    )

    assert minted.status_code == 404
    assert revoked.status_code == 404


async def test_list_agents_only_returns_callers_agents(
    api_client: AsyncClient, manager_headers: dict, other_headers: dict, agent: dict
):
    theirs = (await create_agent(api_client, other_headers)).json()

    mine = {
        a["id"] for a in (await api_client.get(f"{API}/agents", headers=manager_headers)).json()
    }
    their = {a["id"] for a in (await api_client.get(f"{API}/agents", headers=other_headers)).json()}

    assert mine == {agent["id"]}
    assert their == {theirs["id"]}


async def test_cannot_mint_key_for_deactivated_agent(
    api_client: AsyncClient, manager_headers: dict, agent: dict
):
    await api_client.post(f"{API}/agents/{agent['id']}/deactivate", headers=manager_headers)

    resp = await api_client.post(
        f"{API}/agents/{agent['id']}/api-keys",
        json={"label": "x", "scopes": ["read:projects"]},
        headers=manager_headers,
    )

    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "AGENT_INACTIVE"


async def test_blocked_agent_rejected_even_with_live_key(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict
):
    me = await api_client.get(f"{API}/auth/me", headers=manager_headers)
    owner = await api_db.get(User, uuid.UUID(me.json()["id"]))
    blocked = await make_agent(api_db, owner)
    blocked.is_blocked = True
    minted = await config_service.mint_key(api_db, blocked.id, "k", ["read:projects"], 30)

    resp = await api_client.get(f"{API}/projects", headers={"X-API-Key": minted.key})

    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "ACCOUNT_BLOCKED"


@pytest.mark.parametrize(
    "call",
    [
        lambda u, db: project_service.add_member(
            uuid.uuid4(), MemberAdd(user_id=uuid.uuid4(), role=RoleEnum.contributor), u, db
        ),
        lambda u, db: project_service.remove_member(uuid.uuid4(), uuid.uuid4(), u, db),
        lambda u, db: config_service.create_api_key(
            APIKeyCreate(label="x", scopes=["read:projects"]), u, db
        ),
        lambda u, db: config_service.revoke_api_key(uuid.uuid4(), u, db),
        lambda u, db: project_service.update_project(uuid.uuid4(), ProjectUpdate(name="n"), u, db),
    ],
)
async def test_service_writes_reject_agent_callers(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict, call
):
    me = await api_client.get(f"{API}/auth/me", headers=manager_headers)
    owner = await api_db.get(User, uuid.UUID(me.json()["id"]))
    bot = await make_agent(api_db, owner)

    with pytest.raises(HTTPException) as exc:
        await call(bot, api_db)

    assert exc.value.status_code == 403
    assert exc.value.detail == "HUMAN_ONLY"


async def test_project_owner_row_changes_keep_their_agents(
    api_client: AsyncClient, api_db: AsyncSession, manager_headers: dict, agent: dict
):
    project = await create_project(api_client, manager_headers)
    me = await api_client.get(f"{API}/auth/me", headers=manager_headers)
    owner_id = me.json()["id"]
    resp = await attach(api_client, manager_headers, project["id"], agent["id"], "manager")
    assert resp.status_code == 201, resp.text
    other_headers, other_id = await make_human(api_client, api_db)
    await add_manager(api_client, manager_headers, project["id"], other_id)
    base = f"{API}/projects/{project['id']}/members"

    demoted = await api_client.patch(
        f"{base}/{owner_id}", json={"role": "contributor"}, headers=other_headers
    )
    assert demoted.status_code == 200, demoted.text
    removed = await api_client.delete(f"{base}/{owner_id}", headers=other_headers)
    assert removed.status_code == 204

    members = await api_client.get(base, headers=manager_headers)
    by_id = {m["user_id"]: m for m in members.json()}
    assert by_id[agent["id"]]["role"] == "manager"
