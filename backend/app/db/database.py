from collections.abc import AsyncGenerator
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def _asyncpg_url(url: str) -> tuple[str, dict]:
    """Strip sslmode from URL and convert to asyncpg connect_args.

    asyncpg uses ssl= not sslmode=, so passing sslmode in the URL raises
    TypeError: connect() got an unexpected keyword argument 'sslmode'.
    """
    parsed = urlparse(url)
    params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
    sslmode = params.pop("sslmode", None)
    clean_url = urlunparse(parsed._replace(query=urlencode(params)))
    connect_args = {"ssl": "require"} if sslmode == "require" else {}
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
