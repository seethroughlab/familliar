"""Dependency injection for API routes."""

from collections.abc import AsyncGenerator
from typing import Annotated
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker


# Default user ID for single-user mode
DEFAULT_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(db: AsyncSession = Depends(get_db)):
    """Get or create the default user for single-user mode."""
    from app.db.models import User

    # Check if default user exists
    result = await db.execute(
        select(User).where(User.id == DEFAULT_USER_ID)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Create default user
        user = User(
            id=DEFAULT_USER_ID,
            username="default",
            email="default@localhost",
            password_hash="",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user


# Type alias for dependency injection
DbSession = Annotated[AsyncSession, Depends(get_db)]
