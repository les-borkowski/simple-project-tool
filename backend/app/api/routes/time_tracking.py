import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.api.schemas.status_history import StatusHistoryResponse, TimeMetricsResponse
from app.api.services import time_tracking_service

router = APIRouter(tags=["time_tracking"])


@router.get("/projects/{project_id}/status-history", response_model=list[StatusHistoryResponse])
async def get_project_status_history(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get status history for a project."""
    return await time_tracking_service.get_status_history("project", project_id, user, db)


@router.get("/stories/{story_id}/status-history", response_model=list[StatusHistoryResponse])
async def get_story_status_history(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get status history for a story."""
    return await time_tracking_service.get_status_history("story", story_id, user, db)


@router.get("/tasks/{task_id}/status-history", response_model=list[StatusHistoryResponse])
async def get_task_status_history(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get status history for a task."""
    return await time_tracking_service.get_status_history("task", task_id, user, db)


@router.get("/projects/{project_id}/time-metrics", response_model=TimeMetricsResponse)
async def get_project_time_metrics(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get time metrics for a project."""
    return await time_tracking_service.get_time_metrics("project", project_id, user, db)


@router.get("/stories/{story_id}/time-metrics", response_model=TimeMetricsResponse)
async def get_story_time_metrics(
    story_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get time metrics for a story."""
    return await time_tracking_service.get_time_metrics("story", story_id, user, db)


@router.get("/tasks/{task_id}/time-metrics", response_model=TimeMetricsResponse)
async def get_task_time_metrics(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get time metrics for a task."""
    return await time_tracking_service.get_time_metrics("task", task_id, user, db)


@router.get("/projects/{project_id}/time-report")
async def get_project_time_report(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate time report for a project."""
    return await time_tracking_service.get_project_time_report(project_id, user, db)


@router.get("/users/{user_id}/time-report")
async def get_user_time_report(
    user_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get time report for a user's assigned work."""
    return await time_tracking_service.get_user_time_report(user_id, user, db)
