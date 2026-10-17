import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.agent import AgentCreate, AgentCreatedResponse, AgentResponse
from app.api.schemas.api_key import APIKeyCreate, APIKeyCreatedResponse, APIKeyResponse
from app.api.services.config_service import mint_key
from app.auth.permissions import require_human, require_not_demo
from app.core.config import settings
from app.db.base import RoleEnum
from app.db.models import APIKey, User
from app.db.models.user import KIND_AGENT


async def _get_owned_agent(agent_id: uuid.UUID, owner: User, db: AsyncSession) -> User:
    agent = await db.get(User, agent_id)
    if agent is None or agent.kind != KIND_AGENT or agent.owner_id != owner.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


async def _to_response(agent: User, db: AsyncSession) -> AgentResponse:
    key_count = await db.scalar(
        select(func.count())
        .select_from(APIKey)
        .where(APIKey.user_id == agent.id, APIKey.revoked_at.is_(None))
    )
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        is_active=not agent.is_blocked,
        created_at=agent.created_at,
        key_count=key_count,
    )


async def create_agent(data: AgentCreate, owner: User, db: AsyncSession) -> AgentCreatedResponse:
    require_human(owner)
    require_not_demo(owner)

    # Deactivated agents count too, otherwise deactivate/create cycles bypass the cap.
    count = await db.scalar(select(func.count()).select_from(User).where(User.owner_id == owner.id))
    if count >= settings.MAX_AGENTS_PER_USER:
        raise HTTPException(status_code=409, detail="AGENT_LIMIT_REACHED")

    agent = User(
        kind=KIND_AGENT,
        role=RoleEnum.contributor,
        email=None,
        password_hash=None,
        email_confirmed=True,
        owner_id=owner.id,
        name=data.name,
    )
    try:
        # Savepoint so a duplicate-name failure leaves the session usable.
        async with db.begin_nested():
            db.add(agent)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="AGENT_NAME_TAKEN") from None

    key = await mint_key(db, agent.id, "default", data.scopes, data.expires_in_days)
    await db.commit()
    await db.refresh(agent)

    return AgentCreatedResponse(
        id=agent.id,
        name=agent.name,
        is_active=not agent.is_blocked,
        created_at=agent.created_at,
        key_count=1,
        key=key,
    )


async def list_agents(owner: User, db: AsyncSession) -> list[AgentResponse]:
    stmt = (
        select(User, func.count(APIKey.id))
        .outerjoin(APIKey, (APIKey.user_id == User.id) & APIKey.revoked_at.is_(None))
        .where(User.owner_id == owner.id, User.kind == KIND_AGENT)
        .group_by(User.id)
        .order_by(User.created_at)
    )
    return [
        AgentResponse(
            id=a.id,
            name=a.name,
            is_active=not a.is_blocked,
            created_at=a.created_at,
            key_count=n,
        )
        for a, n in (await db.execute(stmt)).all()
    ]


async def rename_agent(
    agent_id: uuid.UUID, name: str, owner: User, db: AsyncSession
) -> AgentResponse:
    require_not_demo(owner)
    agent = await _get_owned_agent(agent_id, owner, db)
    agent.name = name
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="AGENT_NAME_TAKEN") from None
    return await _to_response(agent, db)


async def deactivate_agent(agent_id: uuid.UUID, owner: User, db: AsyncSession) -> None:
    agent = await _get_owned_agent(agent_id, owner, db)
    agent.is_blocked = True
    await db.execute(
        update(APIKey)
        .where(APIKey.user_id == agent.id, APIKey.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC).replace(tzinfo=None))
    )
    await db.commit()


async def reactivate_agent(agent_id: uuid.UUID, owner: User, db: AsyncSession) -> AgentResponse:
    agent = await _get_owned_agent(agent_id, owner, db)
    agent.is_blocked = False
    await db.commit()
    return await _to_response(agent, db)


async def list_agent_keys(
    agent_id: uuid.UUID, owner: User, db: AsyncSession
) -> list[APIKeyResponse]:
    agent = await _get_owned_agent(agent_id, owner, db)
    stmt = (
        select(APIKey)
        .where(APIKey.user_id == agent.id, APIKey.revoked_at.is_(None))
        .order_by(APIKey.created_at.desc())
    )
    return [APIKeyResponse.model_validate(k) for k in (await db.scalars(stmt)).all()]


async def create_agent_key(
    agent_id: uuid.UUID, data: APIKeyCreate, owner: User, db: AsyncSession
) -> APIKeyCreatedResponse:
    require_not_demo(owner)
    agent = await _get_owned_agent(agent_id, owner, db)
    if agent.is_blocked:
        raise HTTPException(status_code=409, detail="AGENT_INACTIVE")
    response = await mint_key(db, agent.id, data.label, data.scopes, data.expires_in_days)
    await db.commit()
    return response


async def revoke_agent_key(
    agent_id: uuid.UUID, key_id: uuid.UUID, owner: User, db: AsyncSession
) -> None:
    agent = await _get_owned_agent(agent_id, owner, db)
    key = await db.get(APIKey, key_id)
    if key is None or key.user_id != agent.id:
        raise HTTPException(status_code=404, detail="API key not found")
    key.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    await db.commit()
