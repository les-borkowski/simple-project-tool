import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.api.schemas.comment import CommentCreate, CommentUpdate, CommentResponse
from app.api.schemas.common import PaginatedResponse
from app.api.services import comment_service

router = APIRouter(tags=["comments"])


@router.get("/projects/{project_id}/comments", response_model=PaginatedResponse[CommentResponse])
async def list_project_comments(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
):
    """List comments on a project."""
    return await comment_service.list_comments_on_project(project_id, user, db, cursor, limit)


@router.get("/stories/{story_id}/comments", response_model=PaginatedResponse[CommentResponse])
async def list_story_comments(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
):
    """List comments on a story."""
    return await comment_service.list_comments_on_story(story_id, user, db, cursor, limit)


@router.get("/tasks/{task_id}/comments", response_model=PaginatedResponse[CommentResponse])
async def list_task_comments(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
):
    """List comments on a task."""
    return await comment_service.list_comments_on_task(task_id, user, db, cursor, limit)


@router.post("/projects/{project_id}/comments", response_model=CommentResponse, status_code=201)
async def create_project_comment(
    project_id: uuid.UUID,
    data: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a project."""
    return await comment_service.create_comment_on_project(project_id, data.body, user, db)


@router.post("/stories/{story_id}/comments", response_model=CommentResponse, status_code=201)
async def create_story_comment(
    story_id: uuid.UUID,
    data: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a story."""
    return await comment_service.create_comment_on_story(story_id, data.body, user, db)


@router.post("/tasks/{task_id}/comments", response_model=CommentResponse, status_code=201)
async def create_task_comment(
    task_id: uuid.UUID,
    data: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a task."""
    return await comment_service.create_comment_on_task(task_id, data.body, user, db)


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: uuid.UUID,
    data: CommentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a comment."""
    return await comment_service.update_comment(comment_id, data.body, user, db)


@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a comment."""
    await comment_service.delete_comment(comment_id, user, db)
