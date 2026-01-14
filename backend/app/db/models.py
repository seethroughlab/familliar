import enum
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    type_annotation_map = {
        dict[str, Any]: JSONB,
    }


class AlbumType(enum.Enum):
    """Album classification for proper handling of compilations/soundtracks."""

    ALBUM = "album"
    EP = "ep"
    SINGLE = "single"
    COMPILATION = "compilation"
    SOUNDTRACK = "soundtrack"
    LIVE = "live"


class TrackStatus(enum.Enum):
    """Track file availability status for safe library management.

    Prevents catastrophic deletion when library path is misconfigured.
    Missing tracks are preserved until user explicitly confirms deletion.
    """

    ACTIVE = "active"  # File exists at path
    MISSING = "missing"  # File not found, awaiting user action
    PENDING_DELETION = "pending_deletion"  # Missing >30 days, suggested for cleanup


class ChangeStatus(enum.Enum):
    """Status of a proposed metadata change."""

    PENDING = "pending"  # Awaiting user review
    APPROVED = "approved"  # User approved, ready to apply
    REJECTED = "rejected"  # User rejected
    APPLIED = "applied"  # Successfully applied


class ChangeSource(enum.Enum):
    """Source that generated a proposed change."""

    USER_REQUEST = "user_request"  # User explicitly asked LLM to fix
    LLM_SUGGESTION = "llm_suggestion"  # LLM noticed while doing something else
    MUSICBRAINZ = "musicbrainz"  # From MusicBrainz lookup
    SPOTIFY = "spotify"  # From Spotify lookup
    AUTO_ENRICHMENT = "auto_enrichment"  # From auto-enrichment service


class ChangeScope(enum.Enum):
    """Scope of changes to apply."""

    DB_ONLY = "db_only"  # Just update Familiar's database
    DB_AND_ID3 = "db_and_id3"  # Also write to audio file tags
    DB_ID3_FILES = "db_id3_files"  # Also rename/move files


class Profile(Base):
    """Selectable profile for multi-user support (Netflix-style).

    Profiles can be selected from any device. No authentication required.
    Each profile has its own playlists, favorites, play history, and service connections.
    """

    __tablename__ = "profiles"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7))  # Hex color like "#3B82F6"
    avatar_path: Mapped[str | None] = mapped_column(String(255))  # e.g. "profiles/abc123.jpg"
    device_id: Mapped[str | None] = mapped_column(String(64))  # Legacy, no longer required
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Relationships
    spotify_profile: Mapped["SpotifyProfile | None"] = relationship(
        back_populates="profile", cascade="all, delete"
    )
    lastfm_profile: Mapped["LastfmProfile | None"] = relationship(
        back_populates="profile", cascade="all, delete"
    )
    playlists: Mapped[list["Playlist"]] = relationship(
        back_populates="profile", cascade="all, delete"
    )
    smart_playlists: Mapped[list["SmartPlaylist"]] = relationship(
        back_populates="profile", cascade="all, delete"
    )
    favorites: Mapped[list["ProfileFavorite"]] = relationship(
        back_populates="profile", cascade="all, delete"
    )
    play_history: Mapped[list["ProfilePlayHistory"]] = relationship(
        back_populates="profile", cascade="all, delete"
    )


class LastfmProfile(Base):
    """Last.fm session storage per profile.

    Persists the Last.fm session key so it survives server restarts.
    Previously this was stored in-memory and lost on restart.
    """

    __tablename__ = "lastfm_profiles"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    username: Mapped[str | None] = mapped_column(String(255))
    session_key: Mapped[str | None] = mapped_column(String(255))
    connected_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="lastfm_profile")


class SpotifyProfile(Base):
    """Spotify OAuth tokens per device profile.

    Linked to Profile for device-based multi-user support.
    """

    __tablename__ = "spotify_profiles"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    spotify_user_id: Mapped[str | None] = mapped_column(String(255))
    access_token: Mapped[str | None] = mapped_column(Text)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    sync_mode: Mapped[str] = mapped_column(String(20), default="periodic")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime)
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="spotify_profile")
    favorites: Mapped[list["SpotifyFavorite"]] = relationship(
        back_populates="spotify_profile", cascade="all, delete"
    )


class SpotifyFavorite(Base):
    """Synced Spotify favorites per device profile."""

    __tablename__ = "spotify_favorites"
    __table_args__ = (
        UniqueConstraint("profile_id", "spotify_track_id", name="uq_spotify_favorite_profile"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("spotify_profiles.profile_id", ondelete="CASCADE"))
    spotify_track_id: Mapped[str] = mapped_column(String(255), nullable=False)
    matched_track_id: Mapped[UUID | None] = mapped_column(ForeignKey("tracks.id", ondelete="SET NULL"))

    # Spotify track data (JSONB for flexibility)
    track_data: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    added_at: Mapped[datetime | None] = mapped_column(DateTime)
    synced_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    spotify_profile: Mapped["SpotifyProfile"] = relationship(back_populates="favorites")
    matched_track: Mapped["Track | None"] = relationship()


class Track(Base):
    """Core track entity with metadata from file tags."""

    __tablename__ = "tracks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    file_path: Mapped[str] = mapped_column(String(1000), unique=True, nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Basic metadata from tags (indexed for common queries)
    title: Mapped[str | None] = mapped_column(String(500))
    artist: Mapped[str | None] = mapped_column(String(500), index=True)
    album: Mapped[str | None] = mapped_column(String(500), index=True)
    album_artist: Mapped[str | None] = mapped_column(String(500))
    album_type: Mapped[AlbumType] = mapped_column(Enum(AlbumType), default=AlbumType.ALBUM)
    track_number: Mapped[int | None] = mapped_column(Integer)
    disc_number: Mapped[int | None] = mapped_column(Integer)
    year: Mapped[int | None] = mapped_column(Integer, index=True)
    genre: Mapped[str | None] = mapped_column(String(255), index=True)

    # Technical metadata
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    sample_rate: Mapped[int | None] = mapped_column(Integer)
    bit_depth: Mapped[int | None] = mapped_column(Integer)
    bitrate: Mapped[int | None] = mapped_column(Integer)
    format: Mapped[str | None] = mapped_column(String(10))

    # External IDs (from MusicBrainz, etc.)
    musicbrainz_track_id: Mapped[str | None] = mapped_column(String(36))
    musicbrainz_artist_id: Mapped[str | None] = mapped_column(String(36))
    musicbrainz_album_id: Mapped[str | None] = mapped_column(String(36))
    isrc: Mapped[str | None] = mapped_column(String(12))

    # Extended metadata (for editing)
    composer: Mapped[str | None] = mapped_column(String(500))
    conductor: Mapped[str | None] = mapped_column(String(500))
    lyricist: Mapped[str | None] = mapped_column(String(500))
    grouping: Mapped[str | None] = mapped_column(String(255))
    comment: Mapped[str | None] = mapped_column(Text)

    # Sort fields (for proper alphabetization)
    sort_artist: Mapped[str | None] = mapped_column(String(500))
    sort_album: Mapped[str | None] = mapped_column(String(500))
    sort_title: Mapped[str | None] = mapped_column(String(500))

    # Embedded lyrics
    lyrics: Mapped[str | None] = mapped_column(Text)

    # User overrides for auto-detected analysis values
    # Example: {"bpm": 124.0, "key": "Am"} - overrides analysis.features values
    user_overrides: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Analysis status
    analysis_version: Mapped[int] = mapped_column(Integer, default=0)
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime)
    analysis_error: Mapped[str | None] = mapped_column(String(500))
    analysis_failed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Timestamps
    file_modified_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # File availability status (prevents catastrophic deletion)
    status: Mapped[TrackStatus] = mapped_column(
        Enum(TrackStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=TrackStatus.ACTIVE,
        index=True,
    )
    missing_since: Mapped[datetime | None] = mapped_column(DateTime)  # When file was first not found

    # Relationships
    analyses: Mapped[list["TrackAnalysis"]] = relationship(
        back_populates="track", cascade="all, delete"
    )
    playlist_entries: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="track", cascade="all, delete"
    )


class TrackAnalysis(Base):
    """Versioned audio analysis with JSONB features and vector embedding."""

    __tablename__ = "track_analysis"
    __table_args__ = (UniqueConstraint("track_id", "version", name="uq_track_analysis_version"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    track_id: Mapped[UUID] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    # Flexible features stored as JSONB (no migrations needed when adding new features)
    # Example: {"bpm": 124.5, "key": "Am", "energy": 0.87, "valence": 0.65, ...}
    features: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Vector embedding for similarity search (CLAP produces 512-dim embeddings)
    embedding: Mapped[Any | None] = mapped_column(Vector(512))

    # Audio fingerprint for identification (base64-encoded, can be very long)
    acoustid: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    track: Mapped["Track"] = relationship(back_populates="analyses")


class Playlist(Base):
    """User-created or AI-generated playlists."""

    __tablename__ = "playlists"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_auto_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    generation_prompt: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="playlists")
    tracks: Mapped[list["PlaylistTrack"]] = relationship(
        back_populates="playlist", cascade="all, delete"
    )


class PlaylistTrack(Base):
    """Junction table for playlist tracks with ordering."""

    __tablename__ = "playlist_tracks"

    playlist_id: Mapped[UUID] = mapped_column(
        ForeignKey("playlists.id", ondelete="CASCADE"), primary_key=True
    )
    track_id: Mapped[UUID] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    playlist: Mapped["Playlist"] = relationship(back_populates="tracks")
    track: Mapped["Track"] = relationship(back_populates="playlist_entries")


class ProfileFavorite(Base):
    """Track favorites per profile (local, not Spotify)."""

    __tablename__ = "profile_favorites"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    track_id: Mapped[UUID] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True
    )
    favorited_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="favorites")
    track: Mapped["Track"] = relationship()


class ProfilePlayHistory(Base):
    """Aggregated play history per profile with counts."""

    __tablename__ = "profile_play_history"

    profile_id: Mapped[UUID] = mapped_column(
        ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    track_id: Mapped[UUID] = mapped_column(
        ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True
    )
    play_count: Mapped[int] = mapped_column(Integer, default=0)
    last_played_at: Mapped[datetime | None] = mapped_column(DateTime)
    total_play_seconds: Mapped[float] = mapped_column(Float, default=0.0)

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="play_history")
    track: Mapped["Track"] = relationship()


class SmartPlaylist(Base):
    """Rule-based auto-updating playlists."""

    __tablename__ = "smart_playlists"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Rules stored as JSONB for flexibility
    # Example: [
    #   {"field": "genre", "operator": "contains", "value": "electronic"},
    #   {"field": "bpm", "operator": "between", "value": [120, 140]},
    #   {"field": "energy", "operator": ">=", "value": 0.7},
    #   {"field": "is_favorite", "operator": "=", "value": true},
    #   {"field": "play_count", "operator": ">=", "value": 5}
    # ]
    rules: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    # Rule matching mode: "all" (AND) or "any" (OR)
    match_mode: Mapped[str] = mapped_column(String(10), default="all")

    # Ordering
    order_by: Mapped[str] = mapped_column(String(50), default="title")
    order_direction: Mapped[str] = mapped_column(String(4), default="asc")

    # Limits
    max_tracks: Mapped[int | None] = mapped_column(Integer)

    # Cache
    cached_track_count: Mapped[int] = mapped_column(Integer, default=0)
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    profile: Mapped["Profile"] = relationship(back_populates="smart_playlists")


class ArtistCheckCache(Base):
    """Cache for tracking when artists were last checked for new releases."""

    __tablename__ = "artist_check_cache"

    artist_name_normalized: Mapped[str] = mapped_column(String(500), primary_key=True)
    musicbrainz_artist_id: Mapped[str | None] = mapped_column(String(36))
    spotify_artist_id: Mapped[str | None] = mapped_column(String(50))
    last_checked_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ArtistNewRelease(Base):
    """Cached new releases discovered from external APIs."""

    __tablename__ = "artist_new_releases"
    __table_args__ = (
        UniqueConstraint("source", "release_id", name="uq_artist_new_release"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # Artist identification
    artist_name: Mapped[str] = mapped_column(String(500), nullable=False)
    artist_name_normalized: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    musicbrainz_artist_id: Mapped[str | None] = mapped_column(String(36))
    spotify_artist_id: Mapped[str | None] = mapped_column(String(50))

    # Release identification
    release_id: Mapped[str] = mapped_column(String(100), nullable=False)  # External ID
    source: Mapped[str] = mapped_column(String(20), nullable=False)  # "spotify" or "musicbrainz"

    # Release metadata
    release_name: Mapped[str] = mapped_column(String(500), nullable=False)
    release_type: Mapped[str | None] = mapped_column(String(20))  # album, single, ep
    release_date: Mapped[datetime | None] = mapped_column(DateTime)
    artwork_url: Mapped[str | None] = mapped_column(String(500))
    external_url: Mapped[str | None] = mapped_column(String(500))
    track_count: Mapped[int | None] = mapped_column(Integer)
    extra_data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    # Status flags
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed_by_profile_id: Mapped[UUID | None] = mapped_column(ForeignKey("profiles.id", ondelete="SET NULL"))
    local_album_match: Mapped[bool] = mapped_column(Boolean, default=False)  # Already in library

    # Timestamps
    discovered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ArtistInfo(Base):
    """Cached artist information from Last.fm API.

    Stores bio, images, and metadata to avoid repeated API calls.
    Cache expires after 30 days.
    """

    __tablename__ = "artist_info"

    # Primary key is normalized artist name (lowercase, stripped)
    artist_name_normalized: Mapped[str] = mapped_column(String(500), primary_key=True)

    # Display name (original casing from Last.fm)
    artist_name: Mapped[str] = mapped_column(String(500), nullable=False)

    # External IDs
    musicbrainz_id: Mapped[str | None] = mapped_column(String(36))
    lastfm_url: Mapped[str | None] = mapped_column(String(500))

    # Bio content
    bio_summary: Mapped[str | None] = mapped_column(Text)  # Short bio
    bio_content: Mapped[str | None] = mapped_column(Text)  # Full bio

    # Images (store URLs - Last.fm provides multiple sizes)
    image_small: Mapped[str | None] = mapped_column(String(500))
    image_medium: Mapped[str | None] = mapped_column(String(500))
    image_large: Mapped[str | None] = mapped_column(String(500))
    image_extralarge: Mapped[str | None] = mapped_column(String(500))

    # Stats from Last.fm
    listeners: Mapped[int | None] = mapped_column(Integer)
    playcount: Mapped[int | None] = mapped_column(BigInteger)

    # Similar artists (stored as JSONB list)
    similar_artists: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    # Tags (stored as JSONB list)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)

    # Cache management
    fetched_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    fetch_error: Mapped[str | None] = mapped_column(String(500))  # Store error if fetch failed


class TrackVideo(Base):
    """Music video downloads linked to tracks (Phase 5)."""

    __tablename__ = "track_videos"
    __table_args__ = (
        UniqueConstraint("track_id", "source", "source_id", name="uq_track_video"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    track_id: Mapped[UUID] = mapped_column(ForeignKey("tracks.id", ondelete="CASCADE"))

    source: Mapped[str] = mapped_column(String(50), nullable=False)  # 'youtube', 'vimeo', etc.
    source_id: Mapped[str] = mapped_column(String(100), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500))

    # Local storage
    file_path: Mapped[str | None] = mapped_column(String(1000))
    is_audio_only: Mapped[bool] = mapped_column(Boolean, default=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)

    # Metadata from source
    video_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # User interaction
    match_confirmed_by: Mapped[UUID | None] = mapped_column()  # Profile ID who confirmed the match
    downloaded_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_played_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    track: Mapped["Track"] = relationship()


class ProposedChange(Base):
    """Proposed metadata change awaiting user review.

    Changes can come from LLM suggestions, user requests, or automated lookups.
    Users can preview, approve, reject, and apply changes with control over
    scope (database only, ID3 tags, file organization).
    """

    __tablename__ = "proposed_changes"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)

    # What kind of change
    change_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "metadata", "artwork", "merge_albums", "set_compilation"
    target_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "track", "album"

    # What's being changed (JSONB for flexibility with multiple tracks)
    target_ids: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False
    )  # List of UUIDs as strings
    field: Mapped[str | None] = mapped_column(
        String(50)
    )  # "artist", "album_artist", "year", etc.
    old_value: Mapped[Any] = mapped_column(JSONB)  # Can be dict mapping track_id -> value
    new_value: Mapped[Any] = mapped_column(JSONB)  # The proposed new value

    # Where the change came from
    source: Mapped[ChangeSource] = mapped_column(
        Enum(ChangeSource, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    source_detail: Mapped[str | None] = mapped_column(
        String(500)
    )  # e.g., "MusicBrainz release: abc123"
    confidence: Mapped[float] = mapped_column(Float, default=1.0)  # 0.0-1.0
    reason: Mapped[str | None] = mapped_column(Text)  # Why this change is suggested

    # How to apply the change
    scope: Mapped[ChangeScope] = mapped_column(
        Enum(ChangeScope, values_callable=lambda obj: [e.value for e in obj]),
        default=ChangeScope.DB_ONLY,
    )

    # Current status
    status: Mapped[ChangeStatus] = mapped_column(
        Enum(ChangeStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=ChangeStatus.PENDING,
        index=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Who approved it (optional - for multi-profile setups)
    approved_by_profile_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("profiles.id", ondelete="SET NULL")
    )
