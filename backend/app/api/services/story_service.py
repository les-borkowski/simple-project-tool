import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.auth.permissions import require_project_access, require_manager
from app.db.models import Story, Project, StatusHistory, User
from app.api.schemas.story import StoryCreate, StoryUpdate, StoryResponse
from app.api.schemas.common import PaginatedResponse
from app.api.pagination import encode_cursor, decode_cursor


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
        stmt = stmt.where(Story.title.ilike(f"%{q}%"))

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where((Story.created_at, Story.id) < (cursor_ts, cursor_id))

    stmt = stmt.order_by(Story.created_at.desc(), Story.id.desc()).limit(limit + 1)
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

    story = Story(
        project_id=project_id,
        title=data.title,
        description=data.description,
        status=data.status or Story.status.default.arg(),
        priority=data.priority or Story.priority.default.arg(),
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
        story.status = data.status
    if data.priority is not None:
        story.priority = data.priority

    story.updated_by = user.id

    if data.status is not None and old_status != data.status:
        history = StatusHistory(
            story_id=story.id,
            from_status=old_status,
            to_status=data.status,
            changed_by=user.id,
        )
        db.add(history)

    await db.commit()
    return StoryResponse.model_validate(story)


async def delete_story(story_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Delete a story. Only managers can delete."""
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    from app.auth.permissions import resolve_role

    role = await resolve_role(user, story.project_id, db)
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

    from app.auth.permissions import resolve_role

    # Check access to current project
    role = await resolve_role(user, story.project_id, db)
    require_manager(role)

    # Check access to new project
    new_project = await db.get(Project, new_project_id)
    if not new_project:
        raise HTTPException(status_code=404, detail="Target project not found")

    role = await resolve_role(user, new_project_id, db)
    require_manager(role)

    story.project_id = new_project_id
    story.updated_by = user.id
    await db.commit()

    return StoryResponse.model_validate(story)
