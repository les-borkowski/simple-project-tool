import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.agent import AgentCreate, AgentCreatedResponse, AgentRename, AgentResponse
from app.api.schemas.api_key import APIKeyCreate, APIKeyCreatedResponse, APIKeyResponse
from app.api.services import agent_service
from app.auth.dependencies import get_current_human
from app.db.database import get_db
from app.db.models import User

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("", response_model=AgentCreatedResponse, status_code=201)
async def create_agent(
    data: AgentCreate,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """Create an agent identity with its first API key."""
    return await agent_service.create_agent(data, user, db)


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """List the caller's agents."""
    return await agent_service.list_agents(user, db)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def rename_agent(
    agent_id: uuid.UUID,
    data: AgentRename,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """Rename an agent."""
    return await agent_service.rename_agent(agent_id, data.name, user, db)


@router.post("/{agent_id}/deactivate", status_code=204)
async def deactivate_agent(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """Block an agent and revoke all its keys."""
    await agent_service.deactivate_agent(agent_id, user, db)


@router.post("/{agent_id}/reactivate", response_model=AgentResponse)
async def reactivate_agent(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """Unblock an agent; revoked keys stay revoked."""
    return await agent_service.reactivate_agent(agent_id, user, db)


@router.get("/{agent_id}/api-keys", response_model=list[APIKeyResponse])
async def list_agent_keys(
    agent_id: uuid.UUID,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """List an agent's active API keys."""
    return await agent_service.list_agent_keys(agent_id, user, db)


@router.post("/{agent_id}/api-keys", response_model=APIKeyCreatedResponse, status_code=201)
async def create_agent_key(
    agent_id: uuid.UUID,
    data: APIKeyCreate,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """Mint a new API key for an agent."""
    return await agent_service.create_agent_key(agent_id, data, user, db)


@router.delete("/{agent_id}/api-keys/{key_id}", status_code=204)
async def revoke_agent_key(
    agent_id: uuid.UUID,
    key_id: uuid.UUID,
    user: User = Depends(get_current_human),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an agent's API key."""
    await agent_service.revoke_agent_key(agent_id, key_id, user, db)
