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
    # Use if_not_exists=True since baseline migration may have already created them
    op.create_index("ix_tracks_artist", "tracks", ["artist"], if_not_exists=True)
    op.create_index("ix_tracks_album", "tracks", ["album"], if_not_exists=True)
    op.create_index("ix_tracks_year", "tracks", ["year"], if_not_exists=True)
    op.create_index("ix_tracks_genre", "tracks", ["genre"], if_not_exists=True)

    # Foreign key indexes for faster joins
    op.create_index("ix_track_analysis_track_id", "track_analysis", ["track_id"], if_not_exists=True)
    op.create_index("ix_playlists_profile_id", "playlists", ["profile_id"], if_not_exists=True)
    op.create_index("ix_smart_playlists_profile_id", "smart_playlists", ["profile_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_tracks_artist", "tracks", if_exists=True)
    op.drop_index("ix_tracks_album", "tracks", if_exists=True)
    op.drop_index("ix_tracks_year", "tracks", if_exists=True)
    op.drop_index("ix_tracks_genre", "tracks", if_exists=True)
    op.drop_index("ix_track_analysis_track_id", "track_analysis", if_exists=True)
    op.drop_index("ix_playlists_profile_id", "playlists", if_exists=True)
    op.drop_index("ix_smart_playlists_profile_id", "smart_playlists", if_exists=True)
