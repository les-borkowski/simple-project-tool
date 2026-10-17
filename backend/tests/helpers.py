from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import RoleEnum
from app.db.models.user import KIND_AGENT, User


async def make_agent(db: AsyncSession, owner: User, name: str = "bot") -> User:
    agent = User(
        kind=KIND_AGENT,
        email=None,
        password_hash=None,
        owner_id=owner.id,
        name=name,
        role=RoleEnum.contributor,
        email_confirmed=True,
    )
    db.add(agent)
    await db.flush()
    return agent
