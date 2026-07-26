import uuid

from fastapi import HTTPException
from sqlalchemy import func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import decode_cursor, encode_cursor
from app.api.schemas.common import PaginatedResponse
from app.api.schemas.task import (
    TaskCreate,
    TaskReorderRequest,
    TaskReorderResponse,
    TaskResponse,
    TaskUpdate,
)
from app.api.services.project_status_service import get_default_status_slug, validate_status_slug
from app.api.services.story_service import get_default_story
from app.api.utils import escape_like
from app.auth.permissions import require_manager, require_not_demo, require_project_access
from app.db.base import PriorityEnum
from app.db.models import Project, Sprint, StatusHistory, Story, Task, User


async def _validate_sprint(sprint_id: uuid.UUID, project_id: uuid.UUID, db: AsyncSession) -> None:
    sprint = await db.get(Sprint, sprint_id)
    if not sprint or sprint.project_id != project_id:
        raise HTTPException(status_code=422, detail="Sprint not found in this project")


async def list_tasks(
    story_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: uuid.UUID | None = None,
    q: str | None = None,
) -> PaginatedResponse[TaskResponse]:
    """List tasks in a story."""
    limit = min(limit, 100)

    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await require_project_access(user, story.project_id, db)

    stmt = select(Task).where(Task.story_id == story_id)

    if status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Task.title.ilike(f"%{escape_like(q)}%", escape="\\"))

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Task.created_at, Task.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Task.created_at.desc(), Task.id.desc()).limit(limit + 1)
    items = (await db.scalars(stmt)).all()

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    return PaginatedResponse(
        items=[TaskResponse.model_validate(item) for item in items],
        next_cursor=next_cursor,
    )


async def create_task(
    story_id: uuid.UUID, data: TaskCreate, user: User, db: AsyncSession
) -> TaskResponse:
    """Create a task in a story."""
    require_not_demo(user)
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await require_project_access(user, story.project_id, db)

    if data.status is not None:
        status_val = await validate_status_slug(story.project_id, data.status, db)
    else:
        status_val = await get_default_status_slug(story.project_id, db)

    if data.sprint_id is not None:
        await _validate_sprint(data.sprint_id, story.project_id, db)

    # Best-effort position: concurrent creates may produce duplicates; reorder endpoint normalizes
    # positions.
    pos_result = await db.execute(select(func.max(Task.position)).where(Task.story_id == story_id))
    max_pos = pos_result.scalar() or 0

    task = Task(
        project_id=story.project_id,
        story_id=story_id,
        title=data.title,
        description=data.description,
        status=status_val,
        priority=data.priority or PriorityEnum.medium,
        assignee_id=data.assignee_id if data.assignee_id is not None else user.id,
        created_by=user.id,
        effort=data.effort,
        due_date=data.due_date,
        sprint_id=data.sprint_id,
        position=max_pos + 1,
    )
    db.add(task)
    await db.flush()

    history = StatusHistory(
        task_id=task.id,
        from_status=None,
        to_status=task.status,
        changed_by=user.id,
    )
    db.add(history)
    await db.commit()

    return TaskResponse.model_validate(task)


async def create_task_for_project(
    project_id: uuid.UUID, data: TaskCreate, user: User, db: AsyncSession
) -> TaskResponse:
    """Create a task under a project; auto-assigns to the project's default Backlog story."""
    require_not_demo(user)
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)

    backlog = await get_default_story(project_id, db)

    if data.status is not None:
        status_val = await validate_status_slug(project_id, data.status, db)
    else:
        status_val = await get_default_status_slug(project_id, db)

    if data.sprint_id is not None:
        await _validate_sprint(data.sprint_id, project_id, db)

    # Best-effort position: concurrent creates may produce duplicates; reorder endpoint normalizes
    # positions.
    pos_result = await db.execute(
        select(func.max(Task.position)).where(Task.story_id == backlog.id)
    )
    max_pos = pos_result.scalar() or 0

    task = Task(
        project_id=project_id,
        story_id=backlog.id,
        title=data.title,
        description=data.description,
        status=status_val,
        priority=data.priority or PriorityEnum.medium,
        assignee_id=data.assignee_id if data.assignee_id is not None else user.id,
        created_by=user.id,
        effort=data.effort,
        due_date=data.due_date,
        sprint_id=data.sprint_id,
        position=max_pos + 1,
    )
    db.add(task)
    await db.flush()

    history = StatusHistory(
        task_id=task.id,
        from_status=None,
        to_status=task.status,
        changed_by=user.id,
    )
    db.add(history)
    await db.commit()

    return TaskResponse.model_validate(task)


async def list_project_tasks(
    project_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: uuid.UUID | None = None,
    q: str | None = None,
    unassigned_only: bool = False,
    sprint_id: uuid.UUID | None = None,
) -> PaginatedResponse[TaskResponse]:
    """List tasks directly under a project (optionally only those with no story)."""
    limit = min(limit, 100)

    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)

    stmt = select(Task).where(Task.project_id == project_id)

    if unassigned_only:
        stmt = stmt.where(Task.story_id.is_(None))
    if status:
        stmt = stmt.where(Task.status == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if assignee_id:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if q:
        stmt = stmt.where(Task.title.ilike(f"%{escape_like(q)}%", escape="\\"))
    if sprint_id is not None:
        stmt = stmt.where(Task.sprint_id == sprint_id)

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Task.created_at, Task.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Task.created_at.desc(), Task.id.desc()).limit(limit + 1)
    items = (await db.scalars(stmt)).all()

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    return PaginatedResponse(
        items=[TaskResponse.model_validate(item) for item in items],
        next_cursor=next_cursor,
    )


async def get_task(task_id: uuid.UUID, user: User, db: AsyncSession) -> TaskResponse:
    """Get a task by ID."""
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await require_project_access(user, task.project_id, db)

    return TaskResponse.model_validate(task)


async def update_task(
    task_id: uuid.UUID, data: TaskUpdate, user: User, db: AsyncSession
) -> TaskResponse:
    """Update a task."""
    require_not_demo(user)
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await require_project_access(user, task.project_id, db)

    old_status = task.status

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.status is not None:
        task.status = await validate_status_slug(task.project_id, data.status, db)
    if data.priority is not None:
        task.priority = data.priority
    if "assignee_id" in data.model_fields_set:
        task.assignee_id = data.assignee_id
    if "effort" in data.model_fields_set:
        task.effort = data.effort
    if "due_date" in data.model_fields_set:
        task.due_date = data.due_date
    if "sprint_id" in data.model_fields_set:
        if data.sprint_id is not None:
            await _validate_sprint(data.sprint_id, task.project_id, db)
        task.sprint_id = data.sprint_id

    task.updated_by = user.id

    if data.status is not None and old_status != task.status:
        history = StatusHistory(
            task_id=task.id,
            from_status=old_status,
            to_status=task.status,
            changed_by=user.id,
        )
        db.add(history)

    await db.commit()
    return TaskResponse.model_validate(task)


async def delete_task(task_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Delete a task. Only managers can delete."""
    require_not_demo(user)
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    role = await require_project_access(user, task.project_id, db)
    require_manager(role)

    await db.delete(task)
    await db.commit()


async def reorder_tasks(
    project_id: uuid.UUID, data: TaskReorderRequest, user: User, db: AsyncSession
) -> TaskReorderResponse:
    """Bulk-update task positions within a project."""
    require_not_demo(user)
    await require_project_access(user, project_id, db)

    task_ids = [item.task_id for item in data.tasks]
    result = await db.execute(
        select(Task.id).where(Task.id.in_(task_ids), Task.project_id == project_id)
    )
    found_ids = set(result.scalars().all())

    if len(found_ids) != len(task_ids):
        raise HTTPException(
            status_code=400, detail="One or more tasks do not belong to this project"
        )

    values = [{"id": item.task_id, "position": item.position} for item in data.tasks]
    await db.execute(
        update(Task),
        values,
    )
    await db.commit()

    return TaskReorderResponse(updated=len(data.tasks))
