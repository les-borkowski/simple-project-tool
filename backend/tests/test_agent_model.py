"""DB-level invariants for agent identities stored in the users table."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models.user import KIND_AGENT, KIND_HUMAN, User


def make_human(email: str | None = None) -> User:
    return User(
        email=email or f"user-{uuid.uuid4().hex[:8]}@example.com",
        name="Human",
        password_hash="hashed",
    )


def make_agent(owner: User, name: str = "Bot") -> User:
    return User(kind=KIND_AGENT, name=name, owner_id=owner.id, email=None, password_hash=None)


async def saved_human(db: AsyncSession) -> User:
    user = make_human()
    db.add(user)
    await db.flush()
    return user


async def test_human_default_kind(db: AsyncSession):
    user = await saved_human(db)
    await db.refresh(user)
    assert user.kind == KIND_HUMAN == "human"
    assert user.owner_id is None


async def test_agent_with_email_rejected(db: AsyncSession):
    owner = await saved_human(db)
    agent = make_agent(owner)
    agent.email = f"agent-{uuid.uuid4().hex[:8]}@example.com"
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(agent)
            await db.flush()


async def test_human_without_email_rejected(db: AsyncSession):
    user = User(kind=KIND_HUMAN, name="Human", email=None, password_hash="hashed")
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(user)
            await db.flush()


async def test_agent_requires_owner(db: AsyncSession):
    agent = User(kind=KIND_AGENT, name="Bot", email=None, password_hash=None, owner_id=None)
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(agent)
            await db.flush()


async def test_agent_name_unique_per_owner_case_insensitive(db: AsyncSession):
    owner = await saved_human(db)
    other_owner = await saved_human(db)
    db.add(make_agent(owner, "Bot"))
    await db.flush()

    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(make_agent(owner, "bot"))
            await db.flush()

    db.add(make_agent(other_owner, "bot"))
    await db.flush()


async def test_owner_with_agents_cannot_be_deleted(db: AsyncSession):
    owner = await saved_human(db)
    db.add(make_agent(owner))
    await db.flush()

    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            await db.delete(owner)
            await db.flush()


def test_max_agents_per_user_default():
    assert settings.MAX_AGENTS_PER_USER == 20
