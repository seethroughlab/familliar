"""Add plugins table for external visualizers and browsers.

Revision ID: add_plugins_table
Revises: add_new_releases_priority
Create Date: 2026-01-15
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID

# revision identifiers
revision = "add_plugins_table"
down_revision = "add_new_releases_priority"
branch_labels = None
depends_on = None

# Define the enum type - create=False since we create it manually
plugintype = ENUM("visualizer", "browser", name="plugintype", create_type=False)


def upgrade() -> None:
    conn = op.get_bind()

    # Create plugin_type enum if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE plugintype AS ENUM ('visualizer', 'browser');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Check if plugins table already exists (may exist if created from models)
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'plugins')"
        )
    )
    if not result.scalar():
        op.create_table(
            "plugins",
            sa.Column("id", UUID, primary_key=True),
            sa.Column("plugin_id", sa.String(100), unique=True, nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("version", sa.String(50), nullable=False),
            sa.Column("plugin_type", plugintype, nullable=False),
            sa.Column("description", sa.Text),
            sa.Column("author_name", sa.String(255)),
            sa.Column("author_url", sa.String(500)),
            sa.Column("repository_url", sa.String(500), nullable=False),
            sa.Column("installed_from", sa.String(500), nullable=False),
            sa.Column("bundle_path", sa.String(500), nullable=False),
            sa.Column("bundle_hash", sa.String(64), nullable=False),
            sa.Column("api_version", sa.Integer, default=1),
            sa.Column("min_familiar_version", sa.String(20)),
            sa.Column("enabled", sa.Boolean, default=True),
            sa.Column("load_error", sa.Text),
            sa.Column("manifest", JSONB, default=dict),
            sa.Column("installed_at", sa.DateTime, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
            sa.Column("last_update_check", sa.DateTime),
        )

        # Index on plugin_type for filtering
        op.create_index("ix_plugins_plugin_type", "plugins", ["plugin_type"])


def downgrade() -> None:
    op.drop_index("ix_plugins_plugin_type")
    op.drop_table("plugins")
    op.execute("DROP TYPE IF EXISTS plugintype")
