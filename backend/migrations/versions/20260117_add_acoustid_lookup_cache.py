"""Add acoustid_lookup cache column to track_analysis.

Revision ID: add_acoustid_lookup
Revises: add_analysis_source
Create Date: 2026-01-17

Caches AcoustID API lookup results (recording candidates with scores)
to avoid repeated API calls for tracks we've already identified.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = "add_acoustid_lookup"
down_revision = "add_analysis_source"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Check if acoustid_lookup column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'track_analysis' AND column_name = 'acoustid_lookup'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "track_analysis",
            sa.Column("acoustid_lookup", JSONB, nullable=True),
        )


def downgrade() -> None:
    op.drop_column("track_analysis", "acoustid_lookup")
