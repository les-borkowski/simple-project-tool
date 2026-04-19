# backend/app/api/services/search_service.py
from sqlalchemy import cast, literal, null, or_, select, union_all
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.search import SearchResultItem
from app.db.base import RoleEnum
from app.db.models import Project, ProjectMember, Story, Task, User


async def search_items(q: str, user: User, db: AsyncSession) -> list[SearchResultItem]:
    if user.role == RoleEnum.manager:
        project_ids_q = select(Project.id)
    else:
        project_ids_q = select(Project.id).where(
            or_(
                Project.owner_id == user.id,
                Project.id.in_(
                    select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
                ),
            )
        )

    projects_q = select(
        literal("project").label("type"),
        Project.id.label("id"),
        Project.name.label("title"),
        Project.id.label("project_id"),
        cast(null(), PGUUID(as_uuid=True)).label("story_id"),
        Project.updated_at.label("updated_at"),
    ).where(
        Project.id.in_(project_ids_q),
        or_(
            Project.name.ilike(f"%{q}%"),
            Project.description.ilike(f"%{q}%"),
        ),
    )

    stories_q = select(
        literal("story").label("type"),
        Story.id.label("id"),
        Story.title.label("title"),
        Story.project_id.label("project_id"),
        cast(null(), PGUUID(as_uuid=True)).label("story_id"),
        Story.updated_at.label("updated_at"),
    ).where(
        Story.project_id.in_(project_ids_q),
        or_(
            Story.title.ilike(f"%{q}%"),
            Story.description.ilike(f"%{q}%"),
        ),
    )

    tasks_q = select(
        literal("task").label("type"),
        Task.id.label("id"),
        Task.title.label("title"),
        Task.project_id.label("project_id"),
        Task.story_id.label("story_id"),
        Task.updated_at.label("updated_at"),
    ).where(
        Task.project_id.in_(project_ids_q),
        or_(
            Task.title.ilike(f"%{q}%"),
            Task.description.ilike(f"%{q}%"),
        ),
    )

    combined = union_all(projects_q, stories_q, tasks_q).subquery()
    stmt = select(combined).order_by(combined.c.updated_at.desc()).limit(20)

    rows = (await db.execute(stmt)).fetchall()

    return [
        SearchResultItem(
            type=row.type,
            id=str(row.id),
            title=row.title,
            project_id=str(row.project_id),
            story_id=str(row.story_id) if row.story_id else None,
            updated_at=row.updated_at,
        )
        for row in rows
    ]
