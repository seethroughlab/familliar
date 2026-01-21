"""Add bitrate_mode column to tracks for quality comparison.

Revision ID: add_bitrate_mode
Revises: add_embedding_failure
Create Date: 2026-01-21

Stores VBR/CBR mode for MP3 files to enable quality-based duplicate detection
and replacement during import.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "add_bitrate_mode"
down_revision = "add_embedding_failure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Check if bitrate_mode column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'tracks' AND column_name = 'bitrate_mode'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "tracks",
            sa.Column("bitrate_mode", sa.String(10), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("tracks", "bitrate_mode")
