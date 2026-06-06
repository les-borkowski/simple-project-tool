import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.project_status import (
    ProjectStatusCreate,
    ProjectStatusResponse,
    ProjectStatusUpdate,
)
from app.auth.permissions import require_manager, require_project_access
from app.db.models import User
from app.db.models.project_status import ProjectStatus
from app.db.models.story import Story as StoryModel
from app.db.models.task import Task

DEFAULT_STATUSES = [
    {"slug": "to_do", "name": "To Do", "colour": "#6b7280", "order": 0},
    {"slug": "in_progress", "name": "In Progress", "colour": "#3b82f6", "order": 1},
    {"slug": "in_review", "name": "In Review", "colour": "#f59e0b", "order": 2},
    {"slug": "done", "name": "Done", "colour": "#22c55e", "order": 3},
]


async def get_project_statuses_ordered(
    project_id: uuid.UUID, db: AsyncSession
) -> list[ProjectStatus]:
    stmt = (
        select(ProjectStatus)
        .where(ProjectStatus.project_id == project_id)
        .order_by(ProjectStatus.order)
    )
    return list((await db.scalars(stmt)).all())


async def seed_default_statuses(project_id: uuid.UUID, db: AsyncSession) -> None:
    for s in DEFAULT_STATUSES:
        db.add(
            ProjectStatus(
                project_id=project_id,
                slug=s["slug"],
                name=s["name"],
                colour=s["colour"],
                order=s["order"],
            )
        )


async def validate_status_slug(project_id: uuid.UUID, slug: str, db: AsyncSession) -> str:
    statuses = await get_project_statuses_ordered(project_id, db)
    if not any(s.slug == slug for s in statuses):
        raise HTTPException(status_code=422, detail=f"Invalid status '{slug}' for this project")
    return slug


async def get_default_status_slug(project_id: uuid.UUID, db: AsyncSession) -> str:
    statuses = await get_project_statuses_ordered(project_id, db)
    if not statuses:
        raise HTTPException(status_code=500, detail="Project has no statuses configured")
    return statuses[0].slug


async def list_project_statuses(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[ProjectStatusResponse]:
    await require_project_access(user, project_id, db)
    statuses = await get_project_statuses_ordered(project_id, db)
    return [ProjectStatusResponse.model_validate(s) for s in statuses]


async def create_project_status(
    project_id: uuid.UUID, data: ProjectStatusCreate, user: User, db: AsyncSession
) -> ProjectStatusResponse:
    role = await require_project_access(user, project_id, db)
    require_manager(role)

    existing = await get_project_statuses_ordered(project_id, db)
    if any(s.slug == data.slug for s in existing):
        raise HTTPException(
            status_code=422, detail=f"Status slug '{data.slug}' already exists in this project"
        )

    status = ProjectStatus(
        project_id=project_id,
        slug=data.slug,
        name=data.name,
        colour=data.colour,
        order=data.order,
    )
    db.add(status)
    await db.commit()
    return ProjectStatusResponse.model_validate(status)


async def update_project_status(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    data: ProjectStatusUpdate,
    user: User,
    db: AsyncSession,
) -> ProjectStatusResponse:
    role = await require_project_access(user, project_id, db)
    require_manager(role)

    status = await db.get(ProjectStatus, status_id)
    if not status or status.project_id != project_id:
        raise HTTPException(status_code=404, detail="Status not found")

    if data.name is not None:
        status.name = data.name
    if data.colour is not None:
        status.colour = data.colour
    if data.order is not None:
        status.order = data.order

    await db.commit()
    return ProjectStatusResponse.model_validate(status)


async def delete_project_status(
    project_id: uuid.UUID, status_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    role = await require_project_access(user, project_id, db)
    require_manager(role)

    status = await db.get(ProjectStatus, status_id)
    if not status or status.project_id != project_id:
        raise HTTPException(status_code=404, detail="Status not found")

    task_count = await db.scalar(
        select(func.count()).where(Task.project_id == project_id, Task.status == status.slug)
    )
    story_count = await db.scalar(
        select(func.count()).where(
            StoryModel.project_id == project_id,
            StoryModel.status == status.slug,
            StoryModel.is_default.is_(False),
        )
    )
    if (task_count or 0) + (story_count or 0) > 0:
        raise HTTPException(
            status_code=422,
            detail=f"Status '{status.slug}' is in use by {task_count} task(s) and {story_count} story/stories. Reassign them first.",
        )

    await db.delete(status)
    await db.commit()
