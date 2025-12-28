"""Profile management endpoints for Netflix-style multi-user support."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import DbSession, RequiredProfile
from app.db.models import Profile

router = APIRouter(prefix="/profiles", tags=["profiles"])


class ProfileCreate(BaseModel):
    """Request to create a new profile."""

    name: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ProfileUpdate(BaseModel):
    """Request to update a profile."""

    name: str | None = Field(None, min_length=1, max_length=100)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ProfileResponse(BaseModel):
    """Profile response."""

    id: UUID
    name: str
    color: str | None
    created_at: str
    has_spotify: bool
    has_lastfm: bool


def profile_to_response(profile: Profile, has_spotify: bool, has_lastfm: bool) -> ProfileResponse:
    """Convert Profile model to response."""
    return ProfileResponse(
        id=profile.id,
        name=profile.name,
        color=profile.color,
        created_at=profile.created_at.isoformat(),
        has_spotify=has_spotify,
        has_lastfm=has_lastfm,
    )


@router.get("", response_model=list[ProfileResponse])
async def list_profiles(db: DbSession) -> list[ProfileResponse]:
    """List all profiles.

    Used by the profile selector screen to show available profiles.
    """
    result = await db.execute(
        select(Profile).order_by(Profile.name)
    )
    profiles = result.scalars().all()

    responses = []
    for profile in profiles:
        await db.refresh(profile, ["spotify_profile", "lastfm_profile"])
        has_spotify = profile.spotify_profile is not None
        has_lastfm = profile.lastfm_profile is not None
        responses.append(profile_to_response(profile, has_spotify, has_lastfm))

    return responses


@router.post("", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    request: ProfileCreate,
    db: DbSession,
) -> ProfileResponse:
    """Create a new profile.

    Returns the new profile's ID which should be stored locally
    and sent in X-Profile-ID header for all subsequent requests.
    """
    profile = Profile(
        name=request.name,
        color=request.color,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return profile_to_response(profile, has_spotify=False, has_lastfm=False)


@router.get("/me", response_model=ProfileResponse)
async def get_current_profile_info(
    profile: RequiredProfile,
    db: DbSession,
) -> ProfileResponse:
    """Get current profile info.

    Requires X-Profile-ID header.
    """
    await db.refresh(profile, ["spotify_profile", "lastfm_profile"])
    has_spotify = profile.spotify_profile is not None
    has_lastfm = profile.lastfm_profile is not None

    return profile_to_response(profile, has_spotify, has_lastfm)


@router.get("/{profile_id}", response_model=ProfileResponse)
async def get_profile(
    profile_id: UUID,
    db: DbSession,
) -> ProfileResponse:
    """Get a profile by ID."""
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    await db.refresh(profile, ["spotify_profile", "lastfm_profile"])
    has_spotify = profile.spotify_profile is not None
    has_lastfm = profile.lastfm_profile is not None

    return profile_to_response(profile, has_spotify, has_lastfm)


@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile(
    profile_id: UUID,
    request: ProfileUpdate,
    db: DbSession,
) -> ProfileResponse:
    """Update a profile."""
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)

    await db.commit()
    await db.refresh(profile, ["spotify_profile", "lastfm_profile"])

    has_spotify = profile.spotify_profile is not None
    has_lastfm = profile.lastfm_profile is not None

    return profile_to_response(profile, has_spotify, has_lastfm)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: UUID,
    db: DbSession,
) -> None:
    """Delete a profile and all associated data."""
    profile = await db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    await db.delete(profile)
    await db.commit()
