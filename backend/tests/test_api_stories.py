import uuid
from unittest.mock import AsyncMock, patch

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


# --- IDOR / Backlog security tests ---


@pytest.mark.asyncio
async def test_delete_story_non_member_global_manager_forbidden(
    api_client: AsyncClient,
    global_manager_headers: dict,
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

    resp = await api_client.delete(f"/api/v1/stories/{sid}", headers=global_manager_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_move_story_non_member_global_manager_forbidden(
    api_client: AsyncClient,
    global_manager_headers: dict,
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
    target_proj = await api_client.post(
        "/api/v1/projects",
        json={"name": "Outsider Project"},
        headers=global_manager_headers,
    )
    assert target_proj.status_code == 201
    target_pid = target_proj.json()["id"]

    # Outsider tries to move a story from a project they don't belong to
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/move",
        json={"project_id": target_pid},
        headers=global_manager_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_move_story_resets_task_statuses_to_target_default(
    api_client: AsyncClient,
    manager_headers: dict,
    test_project: dict,
):
    """Moving a story to another project resets its tasks' statuses to the target project's default."""
    pid = test_project["id"]

    # Create a story and a task in the source project
    story_resp = await api_client.post(
        f"/api/v1/projects/{pid}/stories",
        json={"title": "Story to Move With Tasks"},
        headers=manager_headers,
    )
    assert story_resp.status_code == 201
    sid = story_resp.json()["id"]

    task_resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Task in Story"},
        headers=manager_headers,
    )
    assert task_resp.status_code == 201
    task_id = task_resp.json()["id"]

    # Move the task to "in_progress" in the source project
    await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"status": "in_progress"},
        headers=manager_headers,
    )

    # Create target project (gets its own default statuses, first is "to_do")
    target_resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "Target Project for Move"},
        headers=manager_headers,
    )
    assert target_resp.status_code == 201
    target_pid = target_resp.json()["id"]

    # Move the story
    move_resp = await api_client.post(
        f"/api/v1/stories/{sid}/move",
        json={"project_id": target_pid},
        headers=manager_headers,
    )
    assert move_resp.status_code == 200

    # Verify the task's status was reset to the target project's default ("to_do")
    task_get = await api_client.get(f"/api/v1/tasks/{task_id}", headers=manager_headers)
    assert task_get.status_code == 200
    assert task_get.json()["status"] == "to_do"


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
