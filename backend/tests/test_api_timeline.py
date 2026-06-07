import pytest
from httpx import AsyncClient
from unittest.mock import patch


@pytest.mark.asyncio
async def test_timeline_task_with_due_date(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    r = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Deadline task", "due_date": "2026-05-30"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data, "Timeline response must be a dict with 'items' key"
    assert "truncated" in data, "Timeline response must have 'truncated' bool"
    items = data["items"]
    match = next((i for i in items if i["task_id"] == task_id), None)
    assert match is not None
    assert match["source"] == "deadline"
    assert match["bar_end"] == "2026-05-30"


@pytest.mark.asyncio
async def test_timeline_task_in_sprint(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    sprint_r = await api_client.post(
        f"/api/v1/projects/{pid}/sprints",
        json={"name": "Sprint 1", "start_date": "2026-05-01", "end_date": "2026-05-14"},
        headers=manager_headers,
    )
    sprint_id = sprint_r.json()["id"]

    r = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Sprint task", "sprint_id": sprint_id},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    items = data["items"]
    match = next((i for i in items if i["task_id"] == task_id), None)
    assert match is not None
    assert match["source"] == "sprint"
    assert match["bar_start"] == "2026-05-01"
    assert match["bar_end"] == "2026-05-14"


@pytest.mark.asyncio
async def test_timeline_excludes_unstarted_tasks(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    r = await api_client.post(
        f"/api/v1/projects/{pid}/tasks",
        json={"title": "Unstarted task"},
        headers=manager_headers,
    )
    task_id = r.json()["id"]

    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert not any(i["task_id"] == task_id for i in items)


@pytest.mark.asyncio
async def test_timeline_empty_project(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline", headers=manager_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"items": [], "truncated": False}


@pytest.mark.asyncio
async def test_timeline_requires_project_access(api_client: AsyncClient, test_project: dict):
    pid = test_project["id"]
    resp = await api_client.get(f"/api/v1/projects/{pid}/timeline")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_timeline_truncated_flag_true_when_limit_exceeded(
    api_client: AsyncClient, manager_headers: dict, test_project: dict
):
    """Issue #2: when task count exceeds the cap, 'truncated: true' must appear in the response."""
    pid = test_project["id"]
    # Create 3 tasks with due dates so they appear on the timeline
    for i in range(3):
        await api_client.post(
            f"/api/v1/projects/{pid}/tasks",
            json={"title": f"task {i}", "due_date": "2026-12-01"},
            headers=manager_headers,
        )

    # Patch the limit down to 2 so truncation kicks in with only 3 tasks
    with patch("app.api.services.timeline_service.TIMELINE_TASK_LIMIT", 2):
        resp = await api_client.get(
            f"/api/v1/projects/{pid}/timeline", headers=manager_headers
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["truncated"] is True, "Expected truncated=True when task count exceeds limit"
    assert len(data["items"]) == 2, "Expected exactly TIMELINE_TASK_LIMIT items when truncated"
