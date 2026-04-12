import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.auth.permissions import require_project_access, resolve_role
from app.db.models import Project, Story, Task, StatusHistory, User
from app.api.schemas.status_history import StatusHistoryResponse, TimeMetricsResponse


async def get_status_history(
    item_type: str, item_id: uuid.UUID, user: User, db: AsyncSession
) -> list[StatusHistoryResponse]:
    """Get status history for a project, story, or task."""
    if item_type == "project":
        project = await db.get(Project, item_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        await require_project_access(user, item_id, db)

        stmt = select(StatusHistory).where(StatusHistory.project_id == item_id)
    elif item_type == "story":
        story = await db.get(Story, item_id)
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
        await require_project_access(user, story.project_id, db)

        stmt = select(StatusHistory).where(StatusHistory.story_id == item_id)
    elif item_type == "task":
        task = await db.get(Task, item_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        story = await db.get(Story, task.story_id)
        await require_project_access(user, story.project_id, db)

        stmt = select(StatusHistory).where(StatusHistory.task_id == item_id)
    else:
        raise HTTPException(status_code=400, detail="Invalid item type")

    stmt = stmt.order_by(StatusHistory.changed_at.asc())
    records = (await db.scalars(stmt)).all()

    return [StatusHistoryResponse.model_validate(record) for record in records]


async def get_time_metrics(
    item_type: str, item_id: uuid.UUID, user: User, db: AsyncSession
) -> TimeMetricsResponse:
    """Get time metrics for a project, story, or task."""
    history = await get_status_history(item_type, item_id, user, db)

    status_seconds: dict[str, int] = {}
    total_seconds = 0

    for i, record in enumerate(history):
        if i + 1 < len(history):
            next_record = history[i + 1]
            elapsed = (next_record.changed_at - record.changed_at).total_seconds()
            status_key = str(record.to_status.value)
            status_seconds[status_key] = status_seconds.get(status_key, 0) + int(elapsed)
            total_seconds += int(elapsed)

    return TimeMetricsResponse(status_seconds=status_seconds, total_seconds=total_seconds)


async def get_project_time_report(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> dict:
    """Get aggregate time report for a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)

    # Get all stories in project
    stmt = select(Story).where(Story.project_id == project_id)
    stories = (await db.scalars(stmt)).all()

    total_metrics = {"status_seconds": {}, "total_seconds": 0}

    for story in stories:
        metrics = await get_time_metrics("story", story.id, user, db)
        for status, seconds in metrics.status_seconds.items():
            total_metrics["status_seconds"][status] = (
                total_metrics["status_seconds"].get(status, 0) + seconds
            )
        total_metrics["total_seconds"] += metrics.total_seconds

    return total_metrics


async def get_user_time_report(
    target_user_id: uuid.UUID, user: User, db: AsyncSession
) -> dict:
    """Get time report for tasks assigned to a user."""
    target_user = await db.get(User, target_user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get all tasks assigned to the user
    stmt = select(Task).where(Task.assignee_id == target_user_id)
    tasks = (await db.scalars(stmt)).all()

    total_metrics = {"status_seconds": {}, "total_seconds": 0}

    for task in tasks:
        # Only include if user has access to the project
        story = await db.get(Story, task.story_id)
        try:
            await require_project_access(user, story.project_id, db)
            metrics = await get_time_metrics("task", task.id, user, db)
            for status, seconds in metrics.status_seconds.items():
                total_metrics["status_seconds"][status] = (
                    total_metrics["status_seconds"].get(status, 0) + seconds
                )
            total_metrics["total_seconds"] += metrics.total_seconds
        except HTTPException:
            # Skip tasks user doesn't have access to
            continue

    return total_metrics
