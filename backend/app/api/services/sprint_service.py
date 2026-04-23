import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.sprint import SprintCreate, SprintResponse, SprintUpdate
from app.auth.permissions import require_manager, require_project_access
from app.db.models import User
from app.db.models.sprint import Sprint
from app.db.models.task import Task


async def list_sprints(
    project_id: uuid.UUID, user: User, db: AsyncSession
) -> list[SprintResponse]:
    await require_project_access(user, project_id, db)
    stmt = select(Sprint).where(Sprint.project_id == project_id).order_by(Sprint.start_date)
    sprints = list((await db.scalars(stmt)).all())
    return [await _build_response(s, db) for s in sprints]


async def create_sprint(
    project_id: uuid.UUID, data: SprintCreate, user: User, db: AsyncSession
) -> SprintResponse:
    role = await require_project_access(user, project_id, db)
    require_manager(role)
    sprint = Sprint(
        project_id=project_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        capacity=data.capacity,
        created_by=user.id,
    )
    db.add(sprint)
    await db.commit()
    return await _build_response(sprint, db)


async def update_sprint(
    sprint_id: uuid.UUID, data: SprintUpdate, user: User, db: AsyncSession
) -> SprintResponse:
    sprint = await db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    role = await require_project_access(user, sprint.project_id, db)
    require_manager(role)
    if data.name is not None:
        sprint.name = data.name
    if data.start_date is not None:
        sprint.start_date = data.start_date
    if data.end_date is not None:
        sprint.end_date = data.end_date
    if 'capacity' in data.model_fields_set:
        sprint.capacity = data.capacity
    await db.commit()
    return await _build_response(sprint, db)


async def delete_sprint(
    sprint_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    sprint = await db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    role = await require_project_access(user, sprint.project_id, db)
    require_manager(role)
    await db.delete(sprint)
    await db.commit()


async def _build_response(sprint: Sprint, db: AsyncSession) -> SprintResponse:
    stmt = select(
        func.count(Task.id),
        func.coalesce(func.sum(Task.effort), 0),
    ).where(Task.sprint_id == sprint.id)
    row = (await db.execute(stmt)).one()
    task_count, total_effort = row
    return SprintResponse(
        id=sprint.id,
        project_id=sprint.project_id,
        name=sprint.name,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        capacity=sprint.capacity,
        created_by=sprint.created_by,
        total_effort=int(total_effort),
        task_count=int(task_count),
    )
