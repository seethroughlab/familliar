"""Add source tracking columns to track_analysis.

Revision ID: add_analysis_source
Revises: add_plugins_table
Create Date: 2026-01-15

Tracks where audio features and embeddings came from:
- "local" - Computed locally via librosa/CLAP
- "reccobeats" - Retrieved from ReccoBeats API
- "community_cache" - Retrieved from community embedding cache
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = "add_analysis_source"
down_revision = "add_plugins_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add source tracking columns
    op.add_column(
        "track_analysis",
        sa.Column("features_source", sa.String(50), nullable=True),
    )
    op.add_column(
        "track_analysis",
        sa.Column("embedding_source", sa.String(50), nullable=True),
    )

    # Set default value for existing rows
    op.execute("UPDATE track_analysis SET features_source = 'local' WHERE features IS NOT NULL")
    op.execute("UPDATE track_analysis SET embedding_source = 'local' WHERE embedding IS NOT NULL")


def downgrade() -> None:
    op.drop_column("track_analysis", "embedding_source")
    op.drop_column("track_analysis", "features_source")
