import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.db.base import PriorityEnum
from app.api.schemas.story import (
    StoryCreate,
    StoryUpdate,
    StoryResponse,
    StoryMoveRequest,
)
from app.api.schemas.common import PaginatedResponse
from app.api.services import story_service

router = APIRouter(tags=["stories"])


@router.get("/projects/{project_id}/stories", response_model=PaginatedResponse[StoryResponse])
async def list_stories(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    status: str | None = Query(None),
    priority: PriorityEnum | None = Query(None),
    q: str | None = Query(None),
):
    """List stories in a project."""
    priority_val = str(priority.value) if priority else None
    return await story_service.list_stories(
        project_id, user, db, cursor, limit, status, priority_val, q
    )


@router.post("/projects/{project_id}/stories", response_model=StoryResponse, status_code=201)
async def create_story(
    project_id: uuid.UUID,
    data: StoryCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a story in a project."""
    return await story_service.create_story(project_id, data, user, db)


@router.get("/stories/{story_id}", response_model=StoryResponse)
async def get_story(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a story by ID."""
    return await story_service.get_story(story_id, user, db)


@router.patch("/stories/{story_id}", response_model=StoryResponse)
async def update_story(
    story_id: uuid.UUID,
    data: StoryUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a story."""
    return await story_service.update_story(story_id, data, user, db)


@router.delete("/stories/{story_id}", status_code=204)
async def delete_story(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a story."""
    await story_service.delete_story(story_id, user, db)


@router.post("/stories/{story_id}/move", response_model=StoryResponse)
async def move_story(
    story_id: uuid.UUID,
    data: StoryMoveRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Move a story to another project."""
    return await story_service.move_story(story_id, data.project_id, user, db)
