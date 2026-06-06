import logging
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.timeline import TimelineTaskResponse
from app.auth.permissions import require_project_access
from app.db.models import StatusHistory, Task, User
from app.db.models.sprint import Sprint

TIMELINE_TASK_LIMIT = 500


async def get_timeline(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[TimelineTaskResponse]:
    await require_project_access(user, project_id, db)

    tasks_stmt = select(Task).where(Task.project_id == project_id).limit(TIMELINE_TASK_LIMIT + 1)
    tasks = list((await db.scalars(tasks_stmt)).all())

    if len(tasks) > TIMELINE_TASK_LIMIT:
        tasks = tasks[:TIMELINE_TASK_LIMIT]
        logging.getLogger(__name__).warning(
            "Timeline for project %s truncated at %d tasks", project_id, TIMELINE_TASK_LIMIT
        )

    if not tasks:
        return []

    task_ids = [t.id for t in tasks]

    # Load all real transitions (from_status IS NOT NULL) ordered by changed_at
    history_stmt = (
        select(StatusHistory)
        .where(
            StatusHistory.task_id.in_(task_ids),
            StatusHistory.from_status.isnot(None),
        )
        .order_by(StatusHistory.changed_at)
    )
    history_rows = list((await db.scalars(history_stmt)).all())

    # Build first and last transition date per task
    first_transition: dict[uuid.UUID, date] = {}
    last_transition: dict[uuid.UUID, date] = {}
    for row in history_rows:
        tid = row.task_id
        d = row.changed_at.date()
        if tid not in first_transition:
            first_transition[tid] = d
        last_transition[tid] = d

    # Load sprints for tasks that have sprint_id
    sprint_ids = {t.sprint_id for t in tasks if t.sprint_id is not None}
    sprints: dict[uuid.UUID, Sprint] = {}
    if sprint_ids:
        sprint_stmt = select(Sprint).where(Sprint.id.in_(sprint_ids))
        for s in await db.scalars(sprint_stmt):
            sprints[s.id] = s

    results: list[TimelineTaskResponse] = []
    for task in tasks:
        bar_start: date | None = None
        bar_end: date | None = None
        source: str | None = None

        if task.due_date is not None:
            bar_end = task.due_date
            bar_start = first_transition.get(task.id, task.created_at.date())
            source = "deadline"
        elif task.sprint_id is not None and task.sprint_id in sprints:
            sprint = sprints[task.sprint_id]
            bar_start = sprint.start_date
            bar_end = sprint.end_date
            source = "sprint"
        elif task.id in first_transition:
            bar_start = first_transition[task.id]
            bar_end = last_transition[task.id]
            source = "status_history"
        else:
            continue

        results.append(
            TimelineTaskResponse(
                task_id=task.id,
                title=task.title,
                status=task.status,
                priority=task.priority,
                story_id=task.story_id,
                sprint_id=task.sprint_id,
                bar_start=bar_start,
                bar_end=bar_end,
                source=source,
            )
        )

    return results
