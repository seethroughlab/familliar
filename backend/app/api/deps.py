"""Dependency injection for API routes."""

from collections.abc import AsyncGenerator
from datetime import datetime
from typing import TYPE_CHECKING, Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker

if TYPE_CHECKING:
    from app.db.models import Profile, User

# Default user ID for single-user mode (legacy, being replaced by profiles)
DEFAULT_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get an async database session."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(db: AsyncSession = Depends(get_db)) -> "User":
    """Get or create the default user for single-user mode (legacy)."""
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


async def get_current_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> "Profile | None":
    """Get profile from X-Profile-ID header.

    The frontend must first register a profile via POST /profiles/register,
    which returns a profile_id. That profile_id should be sent in the
    X-Profile-ID header for all subsequent requests.

    For backwards compatibility, if no header is provided, returns None
    allowing routes to fall back to legacy behavior.
    """
    from app.db.models import Profile

    profile_id_str = request.headers.get("X-Profile-ID")

    if not profile_id_str:
        return None  # Allow fallback to legacy behavior

    try:
        profile_id = UUID(profile_id_str)
    except ValueError:
        raise HTTPException(400, "Invalid profile ID format")

    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(401, "Invalid profile ID - please re-register")

    # Update last_seen timestamp
    profile.last_seen_at = datetime.utcnow()
    await db.commit()

    return profile


async def require_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> "Profile":
    """Require a valid profile from X-Profile-ID header.

    Unlike get_current_profile, this raises an error if no profile is provided.
    Use this for endpoints that require a profile.
    """
    from app.db.models import Profile

    profile_id_str = request.headers.get("X-Profile-ID")

    if not profile_id_str:
        raise HTTPException(401, "Profile ID required - register at POST /profiles/register")

    try:
        profile_id = UUID(profile_id_str)
    except ValueError:
        raise HTTPException(400, "Invalid profile ID format")

    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(401, "Invalid profile ID - please re-register")

    # Update last_seen timestamp
    profile.last_seen_at = datetime.utcnow()
    await db.commit()

    return profile


# Type aliases for dependency injection
DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentProfile = Annotated["Profile", Depends(get_current_profile)]
RequiredProfile = Annotated["Profile", Depends(require_profile)]
