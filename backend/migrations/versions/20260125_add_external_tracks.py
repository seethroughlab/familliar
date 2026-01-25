"""Add external tracks support for missing track system.

Revision ID: add_external_tracks
Revises: add_bitrate_mode
Create Date: 2026-01-25

Creates external_tracks table for tracks users want but don't have locally.
Modifies playlist_tracks to support both local and external tracks.
Adds is_wishlist to playlists for the wishlist system playlist.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = "add_external_tracks"
down_revision = "add_bitrate_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create ExternalTrackSource enum (check if exists first for idempotency)
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM pg_type WHERE typname = 'externaltracksource'
            )
            """
        )
    )
    if not result.scalar():
        external_track_source = postgresql.ENUM(
            "spotify_playlist",
            "spotify_favorite",
            "playlist_import",
            "llm_recommendation",
            "manual",
            name="externaltracksource",
        )
        external_track_source.create(conn)

    # Create external_tracks table (check if exists for idempotency)
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'external_tracks'
            )
            """
        )
    )
    if result.scalar():
        # Table already exists, skip creation
        return

    op.create_table(
        "external_tracks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("artist", sa.String(500), nullable=False),
        sa.Column("album", sa.String(500), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("track_number", sa.Integer(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("isrc", sa.String(12), nullable=True),
        sa.Column("spotify_id", sa.String(50), nullable=True, unique=True),
        sa.Column("musicbrainz_recording_id", sa.String(36), nullable=True),
        sa.Column("deezer_id", sa.String(50), nullable=True),
        sa.Column("preview_url", sa.String(500), nullable=True),
        sa.Column("preview_source", sa.String(20), nullable=True),
        sa.Column("external_data", postgresql.JSONB(), server_default="{}"),
        sa.Column(
            "source",
            sa.Enum(
                "spotify_playlist",
                "spotify_favorite",
                "playlist_import",
                "llm_recommendation",
                "manual",
                name="externaltracksource",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "source_playlist_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("playlists.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_spotify_playlist_id", sa.String(50), nullable=True),
        sa.Column(
            "matched_track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tracks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("matched_at", sa.DateTime(), nullable=True),
        sa.Column("match_confidence", sa.Float(), nullable=True),
        sa.Column("match_method", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # Create indexes on external_tracks
    op.create_index("ix_external_tracks_artist", "external_tracks", ["artist"])
    op.create_index("ix_external_tracks_isrc", "external_tracks", ["isrc"])
    op.create_index("ix_external_tracks_spotify_id", "external_tracks", ["spotify_id"])
    op.create_index("ix_external_tracks_matched", "external_tracks", ["matched_track_id"])
    op.create_index("ix_external_tracks_source", "external_tracks", ["source"])

    # Add is_wishlist column to playlists
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'playlists' AND column_name = 'is_wishlist'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "playlists",
            sa.Column("is_wishlist", sa.Boolean(), server_default="false", nullable=False),
        )

    # Modify playlist_tracks to support external tracks
    # This requires recreating the table due to PK change

    # Step 1: Create new table with desired schema
    op.create_table(
        "playlist_tracks_new",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "playlist_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("playlists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tracks.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "external_track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("external_tracks.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), server_default=sa.func.now()),
        sa.CheckConstraint(
            "(track_id IS NOT NULL AND external_track_id IS NULL) OR "
            "(track_id IS NULL AND external_track_id IS NOT NULL)",
            name="ck_playlist_track_exactly_one_ref",
        ),
    )

    # Step 2: Copy existing data with generated UUIDs
    conn.execute(
        sa.text(
            """
            INSERT INTO playlist_tracks_new (id, playlist_id, track_id, external_track_id, position, added_at)
            SELECT gen_random_uuid(), playlist_id, track_id, NULL, position, added_at
            FROM playlist_tracks
            """
        )
    )

    # Step 3: Drop old table and rename new one
    op.drop_table("playlist_tracks")
    op.rename_table("playlist_tracks_new", "playlist_tracks")

    # Step 4: Create indexes
    op.create_index("ix_playlist_tracks_playlist", "playlist_tracks", ["playlist_id"])
    op.create_index("ix_playlist_tracks_track", "playlist_tracks", ["track_id"])
    op.create_index("ix_playlist_tracks_external", "playlist_tracks", ["external_track_id"])


def downgrade() -> None:
    conn = op.get_bind()

    # Recreate original playlist_tracks schema
    op.create_table(
        "playlist_tracks_old",
        sa.Column(
            "playlist_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("playlists.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "track_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tracks.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # Copy data back (only local tracks, external tracks are lost)
    conn.execute(
        sa.text(
            """
            INSERT INTO playlist_tracks_old (playlist_id, track_id, position, added_at)
            SELECT playlist_id, track_id, position, added_at
            FROM playlist_tracks
            WHERE track_id IS NOT NULL
            """
        )
    )

    op.drop_table("playlist_tracks")
    op.rename_table("playlist_tracks_old", "playlist_tracks")

    # Remove is_wishlist from playlists
    op.drop_column("playlists", "is_wishlist")

    # Drop external_tracks table and indexes
    op.drop_index("ix_external_tracks_source", "external_tracks")
    op.drop_index("ix_external_tracks_matched", "external_tracks")
    op.drop_index("ix_external_tracks_spotify_id", "external_tracks")
    op.drop_index("ix_external_tracks_isrc", "external_tracks")
    op.drop_index("ix_external_tracks_artist", "external_tracks")
    op.drop_table("external_tracks")

    # Drop enum
    postgresql.ENUM(name="externaltracksource").drop(conn, checkfirst=True)
