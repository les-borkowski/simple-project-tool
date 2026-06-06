import os
import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.main import app
from app.core.config import settings
from app.db.database import get_db


@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    """Run Alembic migrations on the test database before any tests run."""
    sync_url = settings.TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
    ini_path = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    cfg = Config(ini_path)
    cfg.set_main_option("sqlalchemy.url", sync_url)
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="session")
async def engine():
    async_engine = create_async_engine(settings.TEST_DATABASE_URL, echo=False, poolclass=NullPool)
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


@pytest_asyncio.fixture
async def api_db(engine) -> AsyncGenerator[AsyncSession, None]:
    """Session for API integration tests.

    Uses savepoint mode so that service-layer commit() calls do not commit the
    outer transaction — everything rolls back at the end of each test.
    """
    async with engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(
            bind=conn,
            expire_on_commit=False,
            autoflush=False,
            join_transaction_mode="create_savepoint",
        )
        yield session
        await session.close()
        await conn.rollback()


@pytest_asyncio.fixture
async def api_client(api_db) -> AsyncGenerator[AsyncClient, None]:
    """httpx AsyncClient wired to the test DB; lifespan DB check is patched."""

    async def override_get_db():
        yield api_db

    app.dependency_overrides[get_db] = override_get_db
    with patch("app.api.main.check_db_connection", new=AsyncMock()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def auth_token(api_client: AsyncClient, api_db: AsyncSession) -> str:
    """Register a unique contributor user and return a valid JWT access token."""
    from sqlalchemy import update

    from app.db.models import User

    email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Test User", "password": "testpassword123"},
        )
    await api_db.execute(update(User).where(User.email == email).values(email_confirmed=True))
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    return resp.json()["access_token"]


@pytest.fixture
def auth_headers(auth_token: str) -> dict:
    return {"Authorization": f"Bearer {auth_token}"}


@pytest_asyncio.fixture
async def manager_auth_token(api_client: AsyncClient, api_db: AsyncSession) -> str:
    """Register a user, promote to manager in DB, and return a valid JWT access token."""
    from sqlalchemy import update

    from app.db.base import RoleEnum
    from app.db.models import User

    email = f"manager_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Manager User", "password": "testpassword123"},
        )
    await api_db.execute(
        update(User).where(User.email == email).values(role=RoleEnum.manager, email_confirmed=True)
    )
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    return resp.json()["access_token"]


@pytest.fixture
def manager_headers(manager_auth_token: str) -> dict:
    return {"Authorization": f"Bearer {manager_auth_token}"}


@pytest_asyncio.fixture
async def test_project(api_client: AsyncClient, manager_headers: dict) -> dict:
    resp = await api_client.post(
        "/api/v1/projects",
        json={"name": "Test Project"},
        headers=manager_headers,
    )
    return resp.json()


@pytest_asyncio.fixture
async def test_story(api_client: AsyncClient, manager_headers: dict, test_project: dict) -> dict:
    resp = await api_client.post(
        f"/api/v1/projects/{test_project['id']}/stories",
        json={"title": "Test Story"},
        headers=manager_headers,
    )
    return resp.json()


@pytest_asyncio.fixture
async def global_manager_headers(api_client: AsyncClient, api_db: AsyncSession) -> dict:
    """Register a new global-manager user not added to any project, return auth headers."""
    from sqlalchemy import update

    from app.db.base import RoleEnum
    from app.db.models import User

    email = f"outsider_{uuid.uuid4().hex[:8]}@example.com"
    with patch("app.core.email.send_email", new=AsyncMock()):
        await api_client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Outsider Manager", "password": "testpassword123"},
        )
    await api_db.execute(
        update(User).where(User.email == email).values(role=RoleEnum.manager, email_confirmed=True)
    )
    await api_db.flush()
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "testpassword123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
