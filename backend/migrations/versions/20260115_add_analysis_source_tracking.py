"""Add source tracking columns to track_analysis.

Revision ID: add_analysis_source
Revises: add_plugins_table
Create Date: 2026-01-15

Tracks where audio features and embeddings came from:
- "local" - Computed locally via librosa/CLAP
- "reccobeats" - Retrieved from ReccoBeats API
- "community_cache" - Retrieved from community embedding cache
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "add_analysis_source"
down_revision = "add_plugins_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Check if features_source column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'track_analysis' AND column_name = 'features_source'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "track_analysis",
            sa.Column("features_source", sa.String(50), nullable=True),
        )
        # Set default value for existing rows
        op.execute("UPDATE track_analysis SET features_source = 'local' WHERE features IS NOT NULL")

    # Check if embedding_source column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'track_analysis' AND column_name = 'embedding_source'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "track_analysis",
            sa.Column("embedding_source", sa.String(50), nullable=True),
        )
        # Set default value for existing rows
        op.execute("UPDATE track_analysis SET embedding_source = 'local' WHERE embedding IS NOT NULL")


def downgrade() -> None:
    op.drop_column("track_analysis", "embedding_source")
    op.drop_column("track_analysis", "features_source")
