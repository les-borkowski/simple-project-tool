import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession


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


# --- IDOR / Backlog security tests ---


async def _create_global_manager_headers(
    api_client: AsyncClient, api_db: AsyncSession
) -> dict:
    """Register a new global-manager user not added to any project, return auth headers."""
    from app.db.base import RoleEnum
    from app.db.models import User

    email = f"outsider_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Outsider Manager", "password": "testpassword123"},
        )
    await api_db.execute(
        update(User).where(User.email == email).values(role=RoleEnum.manager, email_confirmed=True)
    )
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_delete_story_non_member_global_manager_forbidden(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    test_project: dict,
):
    """A global manager who is NOT a project member must get 403 when deleting a story."""
    pid = test_project["id"]
    create = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "IDOR Target Story"},
        headers=manager_headers,
    )
    assert create.status_code == 201
    sid = create.json()["id"]

    outsider_headers = await _create_global_manager_headers(api_client, api_db)
    resp = await api_client.delete(f"/api/v1/stories/{sid}", headers=outsider_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_move_story_non_member_global_manager_forbidden(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    test_project: dict,
):
    """A global manager who is NOT a member of either project must get 403 when moving a story."""
    pid = test_project["id"]
    create = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "Story to Move"},
        headers=manager_headers,
    )
    assert create.status_code == 201
    sid = create.json()["id"]

    # Outsider creates their own project as the target
    outsider_headers = await _create_global_manager_headers(api_client, api_db)
    target_proj = await api_client.post(
        "/api/v1/projects",
        json={"name": "Outsider Project"},
        headers=outsider_headers,
    )
    assert target_proj.status_code == 201
    target_pid = target_proj.json()["id"]

    # Outsider tries to move a story from a project they don't belong to
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/move",
        json={"project_id": target_pid},
        headers=outsider_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_move_story_cannot_move_backlog(
    api_client: AsyncClient,
    manager_headers: dict,
    test_project: dict,
):
    """Moving the default Backlog story must return 400."""
    pid = test_project["id"]

    # Find the default backlog story (is_default=True)
    stories_resp = await api_client.get(
        f"/api/v1/projects/{pid}/stories", headers=manager_headers
    )
    assert stories_resp.status_code == 200
    stories = stories_resp.json()["items"]
    backlog = next(s for s in stories if s["is_default"])

    # Create a second project to move to
    proj2 = await api_client.post(
        "/api/v1/projects", json={"name": "Target Project"}, headers=manager_headers
    )
    assert proj2.status_code == 201
    target_pid = proj2.json()["id"]

    resp = await api_client.post(
        f"/api/v1/stories/{backlog['id']}/move",
        json={"project_id": target_pid},
        headers=manager_headers,
    )
    assert resp.status_code == 400
    assert "Backlog" in resp.json()["error"]["message"]
