from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

# Create async engine (for FastAPI)
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
    pool_size=20,           # Up from default 5
    max_overflow=20,        # Up from default 10 (40 total)
    pool_pre_ping=True,     # Detect stale connections
    pool_recycle=1800,      # Recycle after 30 mins
)

# Async session factory (for FastAPI)
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Create sync engine (for Celery workers)
# Convert async URL to sync URL
sync_database_url = settings.database_url.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)

sync_engine = create_engine(
    sync_database_url,
    echo=settings.debug,
    future=True,
    pool_size=20,           # Up from default 5
    max_overflow=20,        # Up from default 10 (40 total)
    pool_pre_ping=True,     # Detect stale connections
    pool_recycle=1800,      # Recycle after 30 mins
)

# Sync session factory (for Celery workers)
sync_session_maker = sessionmaker(
    sync_engine,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for getting async database sessions."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
