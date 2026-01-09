"""Add metadata editing fields to tracks table.

Revision ID: add_metadata_editing
Revises: add_artist_info
Create Date: 2025-01-09

Adds extended metadata fields for editing: composer, conductor, lyricist,
grouping, comment, sort fields, lyrics, and user overrides for analysis values.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = "add_metadata_editing"
down_revision = "add_artist_info"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if columns already exist (idempotent migration)
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'tracks' AND column_name = 'composer'"
        )
    )
    if result.fetchone():
        return  # Columns already exist

    # Extended metadata
    op.add_column("tracks", sa.Column("composer", sa.String(500), nullable=True))
    op.add_column("tracks", sa.Column("conductor", sa.String(500), nullable=True))
    op.add_column("tracks", sa.Column("lyricist", sa.String(500), nullable=True))
    op.add_column("tracks", sa.Column("grouping", sa.String(255), nullable=True))
    op.add_column("tracks", sa.Column("comment", sa.Text, nullable=True))

    # Sort fields (for proper alphabetization)
    op.add_column("tracks", sa.Column("sort_artist", sa.String(500), nullable=True))
    op.add_column("tracks", sa.Column("sort_album", sa.String(500), nullable=True))
    op.add_column("tracks", sa.Column("sort_title", sa.String(500), nullable=True))

    # Embedded lyrics
    op.add_column("tracks", sa.Column("lyrics", sa.Text, nullable=True))

    # User overrides for auto-detected analysis values (BPM, key, etc.)
    op.add_column(
        "tracks",
        sa.Column("user_overrides", JSONB, server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("tracks", "user_overrides")
    op.drop_column("tracks", "lyrics")
    op.drop_column("tracks", "sort_title")
    op.drop_column("tracks", "sort_album")
    op.drop_column("tracks", "sort_artist")
    op.drop_column("tracks", "comment")
    op.drop_column("tracks", "grouping")
    op.drop_column("tracks", "lyricist")
    op.drop_column("tracks", "conductor")
    op.drop_column("tracks", "composer")
