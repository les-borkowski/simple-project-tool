import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.api_key import APIKeyCreate, APIKeyCreatedResponse, APIKeyResponse
from app.api.schemas.config import UserConfigResponse, UserConfigUpdate
from app.api.schemas.llm_provider import (
    ProviderCatalogueItem,
    UserLLMProviderResponse,
    UserLLMProviderUpdate,
)
from app.api.services import config_service, llm_credential_service
from app.auth.dependencies import get_current_user
from app.core.llm.providers import PROVIDERS
from app.db.database import get_db
from app.db.models import User

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


@router.get("/llm-providers/available", response_model=list[ProviderCatalogueItem])
async def list_available_providers():
    """The provider catalogue — static metadata, no per-user state. Must be registered
    before /llm-providers/{provider} or FastAPI matches "available" as a provider id."""
    return [
        ProviderCatalogueItem(
            id=spec.id,
            label=spec.label,
            default_model=spec.default_model,
            available=spec.available,
            key_hint=spec.key_hint,
            docs_url=spec.docs_url,
        )
        for spec in PROVIDERS.values()
    ]


@router.get("/llm-providers", response_model=list[UserLLMProviderResponse])
async def list_llm_providers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's configured LLM credentials. Never includes the raw key."""
    return await llm_credential_service.list_providers(user, db)


@router.patch("/llm-providers/{provider}", response_model=UserLLMProviderResponse)
async def upsert_llm_provider(
    provider: str,
    data: UserLLMProviderUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update the current user's credential for a provider."""
    return await llm_credential_service.upsert_provider(user, provider, data, db)


@router.delete("/llm-providers/{provider}", status_code=204)
async def delete_llm_provider(
    provider: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the current user's credential for a provider."""
    await llm_credential_service.delete_provider(user, provider, db)


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
