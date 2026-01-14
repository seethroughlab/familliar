"""Add proposed_changes table for metadata corrections.

Revision ID: add_proposed_changes
Revises: 73a97e82b273
Create Date: 2026-01-14

Stores proposed metadata changes from LLM suggestions, user requests,
or automated lookups. Users can preview, approve, reject, and apply
changes with control over scope.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM, JSONB

# revision identifiers
revision = "add_proposed_changes"
down_revision = "73a97e82b273"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table already exists
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'proposed_changes')"
        )
    )
    if result.scalar():
        return  # Table already exists

    # Create enum types (use IF NOT EXISTS to avoid conflicts)
    op.execute(
        "DO $$ BEGIN CREATE TYPE changestatus AS ENUM ('pending', 'approved', 'rejected', 'applied'); EXCEPTION WHEN duplicate_object THEN null; END $$"
    )
    op.execute(
        "DO $$ BEGIN CREATE TYPE changesource AS ENUM ('user_request', 'llm_suggestion', 'musicbrainz', 'spotify', 'auto_enrichment'); EXCEPTION WHEN duplicate_object THEN null; END $$"
    )
    op.execute(
        "DO $$ BEGIN CREATE TYPE changescope AS ENUM ('db_only', 'db_and_id3', 'db_id3_files'); EXCEPTION WHEN duplicate_object THEN null; END $$"
    )

    op.create_table(
        "proposed_changes",
        sa.Column(
            "id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        # What kind of change
        sa.Column("change_type", sa.String(50), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        # What's being changed
        sa.Column("target_ids", JSONB, nullable=False),
        sa.Column("field", sa.String(50), nullable=True),
        sa.Column("old_value", JSONB, nullable=True),
        sa.Column("new_value", JSONB, nullable=True),
        # Source information
        sa.Column(
            "source",
            ENUM(
                "user_request",
                "llm_suggestion",
                "musicbrainz",
                "spotify",
                "auto_enrichment",
                name="changesource",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("source_detail", sa.String(500), nullable=True),
        sa.Column("confidence", sa.Float, server_default="1.0"),
        sa.Column("reason", sa.Text, nullable=True),
        # Scope
        sa.Column(
            "scope",
            ENUM(
                "db_only", "db_and_id3", "db_id3_files", name="changescope", create_type=False
            ),
            server_default="db_only",
        ),
        # Status
        sa.Column(
            "status",
            ENUM(
                "pending", "approved", "rejected", "applied", name="changestatus", create_type=False
            ),
            server_default="pending",
            nullable=False,
        ),
        # Timestamps
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("approved_at", sa.DateTime, nullable=True),
        sa.Column("applied_at", sa.DateTime, nullable=True),
        # Profile reference
        sa.Column(
            "approved_by_profile_id",
            sa.UUID(),
            sa.ForeignKey("profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Create indexes for common queries
    op.create_index("ix_proposed_changes_status", "proposed_changes", ["status"])
    op.create_index("ix_proposed_changes_created_at", "proposed_changes", ["created_at"])
    op.create_index("ix_proposed_changes_source", "proposed_changes", ["source"])


def downgrade() -> None:
    # Check if table exists before dropping
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'proposed_changes')"
        )
    )
    if result.scalar():
        op.drop_index("ix_proposed_changes_source", table_name="proposed_changes")
        op.drop_index("ix_proposed_changes_created_at", table_name="proposed_changes")
        op.drop_index("ix_proposed_changes_status", table_name="proposed_changes")
        op.drop_table("proposed_changes")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS changestatus")
    op.execute("DROP TYPE IF EXISTS changesource")
    op.execute("DROP TYPE IF EXISTS changescope")
