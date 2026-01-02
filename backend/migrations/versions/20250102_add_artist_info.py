"""Add artist_info cache table for Last.fm data.

Revision ID: add_artist_info
Revises: add_performance_indexes
Create Date: 2025-01-02

Stores cached artist information from Last.fm API including bio,
images, stats, and similar artists. Cache expires after 30 days.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = "add_artist_info"
down_revision = "add_performance_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table already exists (created by baseline via models)
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'artist_info')"
        )
    )
    if result.scalar():
        return  # Table already exists

    op.create_table(
        "artist_info",
        sa.Column("artist_name_normalized", sa.String(500), primary_key=True),
        sa.Column("artist_name", sa.String(500), nullable=False),
        sa.Column("musicbrainz_id", sa.String(36), nullable=True),
        sa.Column("lastfm_url", sa.String(500), nullable=True),
        sa.Column("bio_summary", sa.Text, nullable=True),
        sa.Column("bio_content", sa.Text, nullable=True),
        sa.Column("image_small", sa.String(500), nullable=True),
        sa.Column("image_medium", sa.String(500), nullable=True),
        sa.Column("image_large", sa.String(500), nullable=True),
        sa.Column("image_extralarge", sa.String(500), nullable=True),
        sa.Column("listeners", sa.Integer, nullable=True),
        sa.Column("playcount", sa.BigInteger, nullable=True),
        sa.Column("similar_artists", JSONB, server_default="[]"),
        sa.Column("tags", JSONB, server_default="[]"),
        sa.Column("fetched_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("fetch_error", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    # Check if table exists before dropping
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'artist_info')"
        )
    )
    if result.scalar():
        op.drop_table("artist_info")
