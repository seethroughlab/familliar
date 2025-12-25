"""Dependency injection for API routes."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


# Type alias for dependency injection
DbSession = Annotated[AsyncSession, Depends(get_db)]
