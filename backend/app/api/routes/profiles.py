"""Profile management endpoints for device-based multi-user support."""

from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession, CurrentProfile
from app.db.models import Profile

router = APIRouter(prefix="/profiles", tags=["profiles"])


class ProfileRegisterRequest(BaseModel):
    """Request to register a new device profile."""

    device_id: str


class ProfileResponse(BaseModel):
    """Profile response."""

    profile_id: UUID
    device_id: str
    created_at: str
    has_spotify: bool
    has_lastfm: bool


@router.post("/register", response_model=ProfileResponse)
async def register_profile(
    request: ProfileRegisterRequest,
    db: DbSession,
) -> ProfileResponse:
    """Register a new device profile or get existing one.

    Frontend should call this on first load to get a profile_id,
    then include that profile_id in X-Profile-ID header for all requests.
    """
    # Check if profile already exists for this device
    result = await db.execute(
        select(Profile).where(Profile.device_id == request.device_id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        # Create new profile
        profile = Profile(device_id=request.device_id)
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    # Check linked integrations
    has_spotify = profile.spotify_profile is not None
    has_lastfm = profile.lastfm_profile is not None

    return ProfileResponse(
        profile_id=profile.id,
        device_id=profile.device_id,
        created_at=profile.created_at.isoformat(),
        has_spotify=has_spotify,
        has_lastfm=has_lastfm,
    )


@router.get("/me", response_model=ProfileResponse)
async def get_current_profile_info(
    profile: CurrentProfile,
    db: DbSession,
) -> ProfileResponse:
    """Get current profile info.

    Requires X-Profile-ID header.
    """
    if not profile:
        from fastapi import HTTPException
        raise HTTPException(401, "Profile ID required")

    # Reload to get relationships
    await db.refresh(profile, ["spotify_profile", "lastfm_profile"])

    has_spotify = profile.spotify_profile is not None
    has_lastfm = profile.lastfm_profile is not None

    return ProfileResponse(
        profile_id=profile.id,
        device_id=profile.device_id,
        created_at=profile.created_at.isoformat(),
        has_spotify=has_spotify,
        has_lastfm=has_lastfm,
    )


@router.delete("/me")
async def delete_profile(
    profile: CurrentProfile,
    db: DbSession,
) -> dict:
    """Delete current profile and all associated data.

    Requires X-Profile-ID header.
    """
    if not profile:
        from fastapi import HTTPException
        raise HTTPException(401, "Profile ID required")

    await db.delete(profile)
    await db.commit()

    return {"status": "deleted", "message": "Profile and all associated data deleted"}
