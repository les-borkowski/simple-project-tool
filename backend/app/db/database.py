from collections.abc import AsyncGenerator
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def _asyncpg_url(url: str) -> tuple[str, dict]:
    """Strip all libpq query params from URL; asyncpg rejects them with TypeError.

    Neon URLs include params like sslmode=require&channel_binding=require that
    are libpq-only. asyncpg uses connect_args instead.
    """
    parsed = urlparse(url)
    params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    requires_ssl = params.get("sslmode") == "require"
    clean_url = urlunparse(parsed._replace(query=""))
    connect_args = {"ssl": "require"} if requires_ssl else {}
    return clean_url, connect_args


_db_url, _connect_args = _asyncpg_url(settings.DATABASE_URL)

engine = create_async_engine(
    _db_url,
    connect_args=_connect_args,
    pool_size=10,
    max_overflow=20,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database session.

    Usage in route:
        async def my_route(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        yield session


async def check_db_connection() -> None:
    """Verify database connectivity on startup.

    Raises:
        Exception: If database connection fails.
    """
    async with AsyncSessionLocal() as session:
        await session.execute(text("SELECT 1"))
