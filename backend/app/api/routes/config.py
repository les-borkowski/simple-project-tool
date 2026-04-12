import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import User
from app.api.schemas.config import UserConfigResponse, UserConfigUpdate
from app.api.schemas.api_key import APIKeyResponse, APIKeyCreatedResponse, APIKeyCreate
from app.api.services import config_service

router = APIRouter(prefix="/config", tags=["config"])


@router.get("", response_model=UserConfigResponse)
async def get_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user configuration."""
    return await config_service.get_config(user, db)


@router.patch("", response_model=UserConfigResponse)
async def update_config(
    data: UserConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user configuration."""
    return await config_service.update_config(data, user, db)


@router.get("/api-keys", response_model=list[APIKeyResponse])
async def list_api_keys(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List API keys."""
    return await config_service.list_api_keys(user, db)


@router.post("/api-keys", response_model=APIKeyCreatedResponse, status_code=201)
async def create_api_key(
    data: APIKeyCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key."""
    return await config_service.create_api_key(data, user, db)


@router.delete("/api-keys/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key."""
    await config_service.revoke_api_key(key_id, user, db)


@router.get("/locales")
async def get_locales():
    """List supported locales."""
    return [
        {
            "code": "en-GB",
            "name": "English (UK)",
            "date_format": "DD/MM/YYYY",
            "number_format": "1,000.00",
        },
        {
            "code": "pl",
            "name": "Polski",
            "date_format": "DD.MM.YYYY",
            "number_format": "1 000,00",
        },
    ]
