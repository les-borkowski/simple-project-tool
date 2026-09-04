import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.capture import (
    CaptureRequest,
    CaptureResponse,
    ConfirmRequest,
    ConfirmResponse,
)
from app.api.schemas.common import PaginatedResponse
from app.api.schemas.task import (
    TaskCreate,
    TaskReorderRequest,
    TaskReorderResponse,
    TaskResponse,
    TaskUpdate,
)
from app.api.services import capture_resolution_service, task_service
from app.auth.dependencies import get_current_user, require_scope
from app.core.llm import get_llm_client
from app.core.llm.base import LLMClient, LLMNotConfigured, LLMUnavailable
from app.db.base import PriorityEnum
from app.db.database import get_db
from app.db.models import User

router = APIRouter(tags=["tasks"])


@router.get("/projects/{project_id}/tasks", response_model=PaginatedResponse[TaskResponse])
async def list_project_tasks(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(25, ge=1, le=500),
    status: str | None = Query(None),
    priority: PriorityEnum | None = Query(None),
    assignee_id: uuid.UUID | None = Query(None),
    q: str | None = Query(None),
    unassigned: bool = Query(False),
    sprint_id: uuid.UUID | None = Query(None),
):
    """List tasks under a project (optionally only those with no story)."""
    priority_val = str(priority.value) if priority else None
    return await task_service.list_project_tasks(
        project_id,
        user,
        db,
        cursor,
        limit,
        status,
        priority_val,
        assignee_id,
        q,
        unassigned,
        sprint_id,
    )


@router.patch("/projects/{project_id}/tasks/reorder", response_model=TaskReorderResponse)
async def reorder_tasks(
    project_id: uuid.UUID,
    data: TaskReorderRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-update task positions within a project."""
    return await task_service.reorder_tasks(project_id, data, user, db)


@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=201)
async def create_task_for_project(
    project_id: uuid.UUID,
    data: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a task directly under a project (no story required)."""
    return await task_service.create_task_for_project(project_id, data, user, db)


@router.post("/projects/{project_id}/tasks/capture", response_model=CaptureResponse)
async def capture_tasks(
    project_id: uuid.UUID,
    payload: CaptureRequest,
    request: Request,
    user: User = Depends(require_scope("write:tasks")),
    db: AsyncSession = Depends(get_db),
    client: LLMClient = Depends(get_llm_client),
):
    """Extract candidate tasks from free text. Writes nothing, ever."""
    try:
        return await capture_resolution_service.preview_capture(
            project_id, payload, user, db, client, request
        )
    except LLMNotConfigured as e:
        raise HTTPException(status_code=503, detail="LLM_NOT_CONFIGURED") from e
    except LLMUnavailable as e:
        raise HTTPException(status_code=503, detail="LLM_UNAVAILABLE") from e


@router.post(
    "/projects/{project_id}/tasks/capture/confirm",
    response_model=ConfirmResponse,
    status_code=201,
)
async def confirm_capture_tasks(
    project_id: uuid.UUID,
    payload: ConfirmRequest,
    user: User = Depends(require_scope("write:tasks")),
    db: AsyncSession = Depends(get_db),
):
    """Create tasks from a reviewed capture batch. All-or-nothing; calls no LLM."""
    return await capture_resolution_service.confirm_capture(project_id, payload, user, db)


@router.get("/stories/{story_id}/tasks", response_model=PaginatedResponse[TaskResponse])
async def list_tasks(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cursor: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    status: str | None = Query(None),
    priority: PriorityEnum | None = Query(None),
    assignee_id: uuid.UUID | None = Query(None),
    q: str | None = Query(None),
):
    """List tasks in a story."""
    priority_val = str(priority.value) if priority else None
    return await task_service.list_tasks(
        story_id, user, db, cursor, limit, status, priority_val, assignee_id, q
    )


@router.post("/stories/{story_id}/tasks", response_model=TaskResponse, status_code=201)
async def create_task(
    story_id: uuid.UUID,
    data: TaskCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a task in a story."""
    return await task_service.create_task(story_id, data, user, db)


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a task by ID."""
    return await task_service.get_task(task_id, user, db)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    return await task_service.update_task(task_id, data, user, db)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task."""
    await task_service.delete_task(task_id, user, db)
