"""Add analysis error tracking columns to tracks.

Revision ID: add_track_error_columns
Revises: baseline
Create Date: 2024-12-31 00:00:01
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "add_track_error_columns"
down_revision: str = "baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add missing columns to tracks table."""
    # Add analysis_error column
    op.add_column(
        "tracks",
        sa.Column("analysis_error", sa.String(500), nullable=True),
    )
    # Add analysis_failed_at column
    op.add_column(
        "tracks",
        sa.Column("analysis_failed_at", sa.DateTime, nullable=True),
    )
    # Add status column with default (uses existing trackstatus enum)
    op.add_column(
        "tracks",
        sa.Column(
            "status",
            sa.Enum("active", "missing", "pending_deletion", name="trackstatus", create_type=False),
            nullable=False,
            server_default="active",
        ),
    )
    # Add missing_since column
    op.add_column(
        "tracks",
        sa.Column("missing_since", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    """Remove the added columns."""
    op.drop_column("tracks", "missing_since")
    op.drop_column("tracks", "status")
    op.drop_column("tracks", "analysis_failed_at")
    op.drop_column("tracks", "analysis_error")
