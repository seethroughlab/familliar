"""Add priority columns to artist_check_cache for priority-based checking.

Revision ID: add_new_releases_priority
Revises: remove_approved_status
Create Date: 2026-01-15

Adds columns to support priority-based new releases checking:
- check_priority: Cached priority score for batch selection
- priority_updated_at: When priority was last calculated
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "add_new_releases_priority"
down_revision = "remove_approved_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Check if check_priority column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'artist_check_cache' AND column_name = 'check_priority'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "artist_check_cache",
            sa.Column("check_priority", sa.Float(), nullable=False, server_default="0.0"),
        )

    # Check if priority_updated_at column exists before adding
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'artist_check_cache' AND column_name = 'priority_updated_at'
            )
            """
        )
    )
    if not result.scalar():
        op.add_column(
            "artist_check_cache",
            sa.Column("priority_updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("artist_check_cache", "priority_updated_at")
    op.drop_column("artist_check_cache", "check_priority")
