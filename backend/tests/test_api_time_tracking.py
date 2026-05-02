import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import PriorityEnum
from app.db.models import StatusHistory, Task


@pytest.mark.asyncio
async def test_task_status_history_for_story_less_task(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    test_project: dict,
):
    """GET /tasks/{id}/status-history must not crash when task.story_id is None."""
    project_id = uuid.UUID(test_project["id"])

    # Insert a task directly with story_id=None to reproduce the bug scenario.
    task = Task(
        project_id=project_id,
        story_id=None,
        title="Story-less task",
        status="to_do",
        priority=PriorityEnum.medium,
        created_by=uuid.UUID(test_project["created_by"]),
        position=1,
    )
    api_db.add(task)
    await api_db.flush()

    history = StatusHistory(
        task_id=task.id,
        from_status=None,
        to_status="to_do",
        changed_by=uuid.UUID(test_project["created_by"]),
    )
    api_db.add(history)
    await api_db.flush()

    resp = await api_client.get(
        f"/api/v1/tasks/{task.id}/status-history",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["from_status"] is None


@pytest.mark.asyncio
async def test_task_time_metrics_for_story_less_task(
    api_client: AsyncClient,
    api_db: AsyncSession,
    manager_headers: dict,
    test_project: dict,
):
    """GET /tasks/{id}/time-metrics must not crash when task.story_id is None."""
    project_id = uuid.UUID(test_project["id"])

    task = Task(
        project_id=project_id,
        story_id=None,
        title="Story-less task 2",
        status="to_do",
        priority=PriorityEnum.medium,
        created_by=uuid.UUID(test_project["created_by"]),
        position=1,
    )
    api_db.add(task)
    await api_db.flush()

    resp = await api_client.get(
        f"/api/v1/tasks/{task.id}/time-metrics",
        headers=manager_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total_seconds"] == 0
