import uuid

from fastapi import HTTPException
from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import decode_cursor, encode_cursor
from app.api.schemas.comment import CommentResponse
from app.api.schemas.common import PaginatedResponse
from app.auth.permissions import require_manager, require_not_demo, require_project_access
from app.db.models import Comment, Project, Story, Task, User


async def list_comments_on_project(
    project_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
) -> PaginatedResponse[CommentResponse]:
    """List comments on a project."""
    limit = min(limit, 100)
    await require_project_access(user, project_id, db)

    stmt = select(Comment).where(Comment.project_id == project_id)

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Comment.created_at, Comment.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(limit + 1)
    items = (await db.scalars(stmt)).all()

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    if not items:
        return PaginatedResponse(items=[], next_cursor=next_cursor)

    author_ids = {item.author_id for item in items}
    authors = {
        u.id: u for u in (await db.scalars(select(User).where(User.id.in_(author_ids)))).all()
    }
    result = [
        CommentResponse(
            id=item.id,
            body=item.body,
            author_id=item.author_id,
            author_name=authors[item.author_id].name if item.author_id in authors else "Unknown",
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]

    return PaginatedResponse(items=result, next_cursor=next_cursor)


async def list_comments_on_story(
    story_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
) -> PaginatedResponse[CommentResponse]:
    """List comments on a story."""
    limit = min(limit, 100)

    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await require_project_access(user, story.project_id, db)

    stmt = select(Comment).where(Comment.story_id == story_id)

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Comment.created_at, Comment.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(limit + 1)
    items = (await db.scalars(stmt)).all()

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    if not items:
        return PaginatedResponse(items=[], next_cursor=next_cursor)

    author_ids = {item.author_id for item in items}
    authors = {
        u.id: u for u in (await db.scalars(select(User).where(User.id.in_(author_ids)))).all()
    }
    result = [
        CommentResponse(
            id=item.id,
            body=item.body,
            author_id=item.author_id,
            author_name=authors[item.author_id].name if item.author_id in authors else "Unknown",
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]

    return PaginatedResponse(items=result, next_cursor=next_cursor)


async def list_comments_on_task(
    task_id: uuid.UUID,
    user: User,
    db: AsyncSession,
    cursor: str | None = None,
    limit: int = 25,
) -> PaginatedResponse[CommentResponse]:
    """List comments on a task."""
    limit = min(limit, 100)

    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await require_project_access(user, task.project_id, db)

    stmt = select(Comment).where(Comment.task_id == task_id)

    if cursor:
        cursor_ts, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(tuple_(Comment.created_at, Comment.id) < tuple_(cursor_ts, cursor_id))

    stmt = stmt.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(limit + 1)
    items = (await db.scalars(stmt)).all()

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, items[-1].id)

    if not items:
        return PaginatedResponse(items=[], next_cursor=next_cursor)

    author_ids = {item.author_id for item in items}
    authors = {
        u.id: u for u in (await db.scalars(select(User).where(User.id.in_(author_ids)))).all()
    }
    result = [
        CommentResponse(
            id=item.id,
            body=item.body,
            author_id=item.author_id,
            author_name=authors[item.author_id].name if item.author_id in authors else "Unknown",
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in items
    ]

    return PaginatedResponse(items=result, next_cursor=next_cursor)


async def create_comment_on_project(
    project_id: uuid.UUID, body: str, user: User, db: AsyncSession
) -> CommentResponse:
    """Create a comment on a project."""
    require_not_demo(user)
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    await require_project_access(user, project_id, db)

    comment = Comment(project_id=project_id, body=body, author_id=user.id)
    db.add(comment)
    await db.commit()

    return CommentResponse(
        id=comment.id,
        body=comment.body,
        author_id=comment.author_id,
        author_name=user.name,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


async def create_comment_on_story(
    story_id: uuid.UUID, body: str, user: User, db: AsyncSession
) -> CommentResponse:
    """Create a comment on a story."""
    require_not_demo(user)
    story = await db.get(Story, story_id)
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await require_project_access(user, story.project_id, db)

    comment = Comment(story_id=story_id, body=body, author_id=user.id)
    db.add(comment)
    await db.commit()

    return CommentResponse(
        id=comment.id,
        body=comment.body,
        author_id=comment.author_id,
        author_name=user.name,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


async def create_comment_on_task(
    task_id: uuid.UUID, body: str, user: User, db: AsyncSession
) -> CommentResponse:
    """Create a comment on a task."""
    require_not_demo(user)
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await require_project_access(user, task.project_id, db)

    comment = Comment(task_id=task_id, body=body, author_id=user.id)
    db.add(comment)
    await db.commit()

    return CommentResponse(
        id=comment.id,
        body=comment.body,
        author_id=comment.author_id,
        author_name=user.name,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


async def update_comment(
    comment_id: uuid.UUID, body: str, user: User, db: AsyncSession
) -> CommentResponse:
    """Update a comment (author only)."""
    require_not_demo(user)
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.author_id != user.id:
        raise HTTPException(status_code=403, detail="Cannot edit others' comments")

    comment.body = body
    await db.commit()

    author = await db.get(User, comment.author_id)
    return CommentResponse(
        id=comment.id,
        body=comment.body,
        author_id=comment.author_id,
        author_name=author.name if author else "Unknown",
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


async def delete_comment(comment_id: uuid.UUID, user: User, db: AsyncSession) -> None:
    """Delete a comment (author or manager only)."""
    require_not_demo(user)
    comment = await db.get(Comment, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Only author or project member with manager role can delete
    if comment.author_id != user.id:
        if comment.project_id:
            project_id = comment.project_id
        elif comment.story_id:
            story = await db.get(Story, comment.story_id)
            project_id = story.project_id
        elif comment.task_id:
            task = await db.get(Task, comment.task_id)
            project_id = task.project_id
        else:
            raise HTTPException(status_code=400, detail="Invalid comment")

        role = await require_project_access(user, project_id, db)
        require_manager(role)

    await db.delete(comment)
    await db.commit()
