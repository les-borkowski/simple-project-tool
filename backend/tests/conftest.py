from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def engine():
    async_engine = create_async_engine(settings.TEST_DATABASE_URL, echo=False)
    yield async_engine
    await async_engine.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    """Each test gets a rolled-back transaction — no persistent state."""
    async with engine.begin() as conn:
        async with AsyncSession(bind=conn) as session:
            yield session
            await session.flush()
            await conn.rollback()
