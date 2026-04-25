import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "My Task"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "My Task"
    assert data["story_id"] == sid
    assert "id" in data
    assert data["assignee_id"] is not None  # defaults to creator
    assert "position" in data
    assert isinstance(data["position"], int)
    assert data["position"] >= 0


@pytest.mark.asyncio
async def test_create_task_explicit_null_assignee(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Unassigned Task", "assignee_id": None},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is not None  # null treated same as omit — defaults to creator


@pytest.mark.asyncio
async def test_create_project_task_defaults_to_creator(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Project Task"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["assignee_id"] is not None  # defaults to creator


@pytest.mark.asyncio
async def test_list_tasks(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Listed Task"},
        headers=manager_headers,
    )
    task_id = create.json()["id"]

    resp = await api_client.get(f"/api/v1/stories/{sid}/tasks", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    ids = [t["id"] for t in data["items"]]
    assert task_id in ids


@pytest.mark.asyncio
async def test_get_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Gettable Task"},
        headers=manager_headers,
    )
    tid = create.json()["id"]

    resp = await api_client.get(f"/api/v1/tasks/{tid}", headers=manager_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == tid


@pytest.mark.asyncio
async def test_update_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Original"},
        headers=manager_headers,
    )
    tid = create.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{tid}",
        json={"title": "Updated Task"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Task"


@pytest.mark.asyncio
async def test_delete_task(api_client: AsyncClient, manager_headers: dict, test_story: dict):
    sid = test_story["id"]
    create = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "To Delete"},
        headers=manager_headers,
    )
    tid = create.json()["id"]

    resp = await api_client.delete(f"/api/v1/tasks/{tid}", headers=manager_headers)
    assert resp.status_code == 204

    get = await api_client.get(f"/api/v1/tasks/{tid}", headers=manager_headers)
    assert get.status_code == 404


@pytest.mark.asyncio
async def test_create_task_with_invalid_status_rejected(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Bad Status Task", "status": "nonexistent"},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_task_with_valid_custom_status(
    api_client: AsyncClient, manager_headers: dict, test_story: dict, test_project: dict
):
    pid = test_project["id"]
    # Create a custom status on the project
    await api_client.post(
        f"/api/v1/projects/{pid}/statuses",
        json={"slug": "deployed", "name": "Deployed", "colour": "#7c3aed", "order": 10},
        headers=manager_headers,
    )
    sid = test_story["id"]
    resp = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Deployed Task", "status": "deployed"},
        headers=manager_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "deployed"


@pytest.mark.asyncio
async def test_task_update_effort_and_due_date(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"effort": 5, "due_date": "2026-05-30"},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["effort"] == 5
    assert data["due_date"] == "2026-05-30"


@pytest.mark.asyncio
async def test_task_response_includes_new_fields(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    data = r.json()
    assert "effort" in data
    assert "due_date" in data
    assert "sprint_id" in data
    assert data["effort"] is None
    assert data["due_date"] is None
    assert data["sprint_id"] is None


@pytest.mark.asyncio
async def test_task_update_sprint_id_same_project(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    pid = test_project["id"]
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "S1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"sprint_id": sprint_id},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["sprint_id"] == sprint_id


@pytest.mark.asyncio
async def test_task_update_sprint_id_wrong_project_rejected(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    proj2 = await api_client.post(
        "/api/v1/projects", json={"name": "Other Project"}, headers=manager_headers
    )
    pid2 = proj2.json()["id"]
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid2}/sprints",
        json={"name": "S1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"sprint_id": sprint_id},
        headers=manager_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_task_update_clears_effort(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task", "effort": 5},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"effort": None},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["effort"] is None


@pytest.mark.asyncio
async def test_task_update_clears_sprint_id(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    pid = test_project["id"]
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "S1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "My task", "sprint_id": sprint_id},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"sprint_id": None},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["sprint_id"] is None


@pytest.mark.asyncio
async def test_task_create_with_effort_and_due_date(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Task with effort", "effort": 8, "due_date": "2026-06-15"},
        headers=manager_headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["effort"] == 8
    assert data["due_date"] == "2026-06-15"


@pytest.mark.asyncio
async def test_task_create_sprint_id_wrong_project_rejected(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    proj2 = await api_client.post(
        "/api/v1/projects", json={"name": "Other Project"}, headers=manager_headers
    )
    pid2 = proj2.json()["id"]
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid2}/sprints",
        json={"name": "S1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Task with bad sprint", "sprint_id": sprint_id},
        headers=manager_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_task_update_clears_due_date(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    r = await api_client.post(
        f"/api/v1/stories/{test_story['id']}/tasks",
        json={"title": "Task with due date", "due_date": "2026-06-01"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"due_date": None},
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["due_date"] is None


@pytest.mark.asyncio
async def test_reorder_tasks(
    api_client: AsyncClient, manager_headers: dict, test_project: dict, test_story: dict
):
    sid = test_story["id"]
    pid = test_project["id"]

    # Create 3 tasks
    r1 = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Task A"},
        headers=manager_headers,
    )
    r2 = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Task B"},
        headers=manager_headers,
    )
    r3 = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Task C"},
        headers=manager_headers,
    )
    tid1 = r1.json()["id"]
    tid2 = r2.json()["id"]
    tid3 = r3.json()["id"]

    # Reorder: reverse order
    reorder_payload = {
        "tasks": [
            {"task_id": tid1, "position": 30},
            {"task_id": tid2, "position": 20},
            {"task_id": tid3, "position": 10},
        ]
    }
    resp = await api_client.patch(
        f"/api/v1/projects/{pid}/tasks/reorder",
        json=reorder_payload,
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"updated": 3}

    # Verify positions were updated
    g1 = await api_client.get(f"/api/v1/tasks/{tid1}", headers=manager_headers)
    g2 = await api_client.get(f"/api/v1/tasks/{tid2}", headers=manager_headers)
    g3 = await api_client.get(f"/api/v1/tasks/{tid3}", headers=manager_headers)
    assert g1.json()["position"] == 30
    assert g2.json()["position"] == 20
    assert g3.json()["position"] == 10


@pytest.mark.asyncio
async def test_reorder_tasks_wrong_project_rejected(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    sid = test_story["id"]

    # Create a task in the test story
    r = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Task X"},
        headers=manager_headers,
    )
    tid = r.json()["id"]

    # Create a second project
    proj2 = await api_client.post(
        "/api/v1/projects", json={"name": "Other Project"}, headers=manager_headers
    )
    pid2 = proj2.json()["id"]

    # Try to reorder task from project 1 via project 2's endpoint
    resp = await api_client.patch(
        f"/api/v1/projects/{pid2}/tasks/reorder",
        json={"tasks": [{"task_id": tid, "position": 5}]},
        headers=manager_headers,
    )
    assert resp.status_code == 400
    assert "do not belong to this project" in resp.json()["error"]["code"]


@pytest.mark.asyncio
async def test_task_position_increments_sequentially(
    api_client: AsyncClient, manager_headers: dict, test_story: dict
):
    sid = test_story["id"]
    r1 = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "First Task"},
        headers=manager_headers,
    )
    assert r1.status_code == 201
    pos1 = r1.json()["position"]
    assert isinstance(pos1, int)
    assert pos1 >= 0

    r2 = await api_client.post(
        f"/api/v1/stories/{sid}/tasks",
        json={"title": "Second Task"},
        headers=manager_headers,
    )
    assert r2.status_code == 201
    pos2 = r2.json()["position"]
    assert isinstance(pos2, int)
    assert pos2 > pos1
