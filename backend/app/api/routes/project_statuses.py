import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.project_status import (
    ProjectStatusCreate,
    ProjectStatusResponse,
    ProjectStatusUpdate,
)
from app.api.services import project_status_service
from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User

router = APIRouter(prefix="/projects", tags=["project-statuses"])


@router.get("/{project_id}/statuses", response_model=list[ProjectStatusResponse])
async def list_project_statuses(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await project_status_service.list_project_statuses(project_id, user, db)


@router.post("/{project_id}/statuses", response_model=ProjectStatusResponse, status_code=201)
async def create_project_status(
    project_id: uuid.UUID,
    data: ProjectStatusCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await project_status_service.create_project_status(project_id, data, user, db)


@router.patch("/{project_id}/statuses/{status_id}", response_model=ProjectStatusResponse)
async def update_project_status(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    data: ProjectStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await project_status_service.update_project_status(project_id, status_id, data, user, db)


@router.delete("/{project_id}/statuses/{status_id}", status_code=204)
async def delete_project_status(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await project_status_service.delete_project_status(project_id, status_id, user, db)
