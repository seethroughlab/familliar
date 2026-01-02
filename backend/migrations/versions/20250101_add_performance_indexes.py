"""Add performance indexes for common queries.

Revision ID: add_performance_indexes
Revises: 20241231_000000_baseline
Create Date: 2025-01-01

Indexes added:
- tracks.artist, tracks.album, tracks.year, tracks.genre (filtering)
- track_analysis.track_id (foreign key lookups)
- playlists.profile_id (per-profile queries)
- smart_playlists.profile_id (per-profile queries)
"""

from alembic import op

# revision identifiers
revision = "add_performance_indexes"
down_revision = "20241231_000000_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Track metadata indexes for filtering/searching
    op.create_index("ix_tracks_artist", "tracks", ["artist"])
    op.create_index("ix_tracks_album", "tracks", ["album"])
    op.create_index("ix_tracks_year", "tracks", ["year"])
    op.create_index("ix_tracks_genre", "tracks", ["genre"])

    # Foreign key indexes for faster joins
    op.create_index("ix_track_analysis_track_id", "track_analysis", ["track_id"])
    op.create_index("ix_playlists_profile_id", "playlists", ["profile_id"])
    op.create_index("ix_smart_playlists_profile_id", "smart_playlists", ["profile_id"])


def downgrade() -> None:
    op.drop_index("ix_tracks_artist", "tracks")
    op.drop_index("ix_tracks_album", "tracks")
    op.drop_index("ix_tracks_year", "tracks")
    op.drop_index("ix_tracks_genre", "tracks")
    op.drop_index("ix_track_analysis_track_id", "track_analysis")
    op.drop_index("ix_playlists_profile_id", "playlists")
    op.drop_index("ix_smart_playlists_profile_id", "smart_playlists")
