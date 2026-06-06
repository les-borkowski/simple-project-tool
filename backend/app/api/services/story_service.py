import uuid

from fastapi import HTTPException
from sqlalchemy import select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import decode_cursor, encode_cursor
from app.api.schemas.common import PaginatedResponse
from app.api.schemas.story import StoryCreate, StoryResponse, StoryUpdate
from app.api.services.project_status_service import get_default_status_slug, validate_status_slug
from app.api.utils import escape_like
from app.auth.permissions import require_manager, require_project_access
from app.db.base import PriorityEnum
from app.db.models import Project, StatusHistory, Story, Task, User


async def list_stories(
    project_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
    status: str | None = None,
    priority: str | None = None,
    q: str | None = None,
) -> PaginatedResponse[StoryResponse]:
    """List stories in a project."""
    limit = min(limit, 100)

    await require_project_access(user, project_id, db)

    stmt = select(Story).where(Story.project_id == project_id)

    if status:
        stmt = stmt.where(Story.status == status)
    if priority:
        stmt = stmt.where(Story.priority == priority)
    if q:
        stmt = stmt.where(Story.title.ilike(f"%{escape_like(q)}%", escape="\\"))

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Story.created_at, Story.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Story.is_default.asc(), Story.created_at.desc(), Story.id.desc()).limit(
        limit + 1
    )
    items = (await db.scalars(stmt)).all()

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    return PaginatedResponse(
        items=[StoryResponse.model_validate(item) for item in items],
        next_cursor=next_cursor,
    )


async def create_story(
    project_id: uuid.UUID, data: StoryCreate, user: User, db: AsyncSession
) -> StoryResponse:
    """Create a story in a project."""
    await require_project_access(user, project_id, db)

    if data.status is not None:
        status_val = await validate_status_slug(project_id, data.status, db)
    else:
        status_val = await get_default_status_slug(project_id, db)

    story = Story(
        project_id=project_id,
        title=data.title,
        description=data.description,
        status=status_val,
        priority=data.priority or PriorityEnum.medium,
        created_by=user.id,
    )
    db.add(story)
    await db.flush()

    # Record initial status
    history = StatusHistory(
        story_id=story.id,
        from_status=None,
        to_status=story.status,
        changed_by=user.id,
    )
    db.add(history)
    await db.commit()

    return StoryResponse.model_validate(story)


async def get_story(story_id: uuid.UUID, user: User, db: AsyncSession) -> StoryResponse:
    """Get a story by ID."""
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await require_project_access(user, story.project_id, db)
    return StoryResponse.model_validate(story)


async def update_story(
    story_id: uuid.UUID, data: StoryUpdate, user: User, db: AsyncSession
) -> StoryResponse:
    """Update a story."""
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await require_project_access(user, story.project_id, db)

    old_status = story.status

    if data.title is not None:
        story.title = data.title
    if data.description is not None:
        story.description = data.description
    if data.status is not None:
        story.status = await validate_status_slug(story.project_id, data.status, db)
    if data.priority is not None:
        story.priority = data.priority

    story.updated_by = user.id

    if data.status is not None and old_status != story.status:
        history = StatusHistory(
            story_id=story.id,
            from_status=old_status,
            to_status=story.status,
            changed_by=user.id,
        )
        db.add(history)

    await db.commit()
    return StoryResponse.model_validate(story)


async def get_default_story(project_id: uuid.UUID, db: AsyncSession) -> Story:
    """Return the default (Backlog) story for a project."""
    result = await db.execute(
        select(Story).where(Story.project_id == project_id, Story.is_default.is_(True))
    )
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=500, detail="Project has no default story")
    return story


async def delete_story(story_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Delete a story. Only managers can delete. The default Backlog story cannot be deleted."""
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if story.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default Backlog story")

    role = await require_project_access(user, story.project_id, db)
    require_manager(role)

    await db.delete(story)
    await db.commit()


async def move_story(
    story_id: uuid.UUID, new_project_id: uuid.UUID, user: User, db: AsyncSession
) -> StoryResponse:
    """Move a story to another project. Only managers can move."""
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    if story.is_default:
        raise HTTPException(status_code=400, detail="Cannot move the default Backlog story")

    # Check access to current project
    role = await require_project_access(user, story.project_id, db)
    require_manager(role)

    # Check access to new project
    new_project = await db.get(Project, new_project_id)
    if not new_project:
        raise HTTPException(status_code=404, detail="Target project not found")

    role = await require_project_access(user, new_project_id, db)
    require_manager(role)

    story.project_id = new_project_id
    story.updated_by = user.id
    await db.execute(
        update(Task).where(Task.story_id == story_id).values(project_id=new_project_id)
    )
    await db.commit()

    return StoryResponse.model_validate(story)
