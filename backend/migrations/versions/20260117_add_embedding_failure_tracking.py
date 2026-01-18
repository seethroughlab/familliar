"""Add embedding failure tracking columns to track_analysis.

Revision ID: add_embedding_failure
Revises: add_acoustid_lookup
Create Date: 2026-01-17

Tracks embedding failures separately from feature extraction failures.
This fixes the library sync getting stuck when embeddings fail for some tracks.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "add_embedding_failure"
down_revision = "add_acoustid_lookup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Check if embedding_error column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'track_analysis' AND column_name = 'embedding_error'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "track_analysis",
            sa.Column("embedding_error", sa.String(500), nullable=True),
        )

    # Check if embedding_failed_at column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'track_analysis' AND column_name = 'embedding_failed_at'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "track_analysis",
            sa.Column("embedding_failed_at", sa.DateTime, nullable=True),
        )


def downgrade() -> None:
    op.drop_column("track_analysis", "embedding_failed_at")
    op.drop_column("track_analysis", "embedding_error")
