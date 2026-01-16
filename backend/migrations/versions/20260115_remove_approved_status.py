"""Remove approved status from proposed_changes.

Revision ID: remove_approved_status
Revises: add_proposed_changes
Create Date: 2026-01-15

Simplifies the proposed changes workflow by removing the "approved" intermediate
status. Changes now go directly from pending to applied.
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "remove_approved_status"
down_revision = "add_proposed_changes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # First, update any existing 'approved' status to 'pending'
    # Use text cast to avoid enum comparison issues on fresh installs
    op.execute(
        "UPDATE proposed_changes SET status = 'pending' WHERE status::text = 'approved'"
    )

    # Check if approved_at column exists before trying to drop it
    # (May not exist if table was created from models instead of migrations)
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'proposed_changes' AND column_name = 'approved_at'
            )
            """
        )
    )
    if result.scalar():
        op.drop_column("proposed_changes", "approved_at")

    # Check if approved_by_profile_id column exists before trying to drop it
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'proposed_changes' AND column_name = 'approved_by_profile_id'
            )
            """
        )
    )
    if result.scalar():
        # Drop FK constraint first, then the column
        op.drop_constraint(
            "proposed_changes_approved_by_profile_id_fkey",
            "proposed_changes",
            type_="foreignkey",
        )
        op.drop_column("proposed_changes", "approved_by_profile_id")

    # Check if 'approved' exists in the changestatus enum before removing it
    result = conn.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT FROM pg_enum
                WHERE enumlabel = 'approved'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'changestatus')
            )
            """
        )
    )
    if result.scalar():
        # Update the enum type to remove 'approved'
        # PostgreSQL doesn't support removing values from enums directly,
        # so we need to create a new type and migrate
        op.execute("ALTER TABLE proposed_changes ALTER COLUMN status DROP DEFAULT")
        op.execute("ALTER TYPE changestatus RENAME TO changestatus_old")
        op.execute(
            "CREATE TYPE changestatus AS ENUM ('pending', 'rejected', 'applied')"
        )
        op.execute(
            """
            ALTER TABLE proposed_changes
            ALTER COLUMN status TYPE changestatus
            USING status::text::changestatus
            """
        )
        op.execute("DROP TYPE changestatus_old")
        op.execute(
            "ALTER TABLE proposed_changes ALTER COLUMN status SET DEFAULT 'pending'"
        )


def downgrade() -> None:
    # Recreate the enum with 'approved'
    op.execute("ALTER TABLE proposed_changes ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE changestatus RENAME TO changestatus_old")
    op.execute(
        "CREATE TYPE changestatus AS ENUM ('pending', 'approved', 'rejected', 'applied')"
    )
    op.execute(
        """
        ALTER TABLE proposed_changes
        ALTER COLUMN status TYPE changestatus
        USING status::text::changestatus
        """
    )
    op.execute("DROP TYPE changestatus_old")
    op.execute("ALTER TABLE proposed_changes ALTER COLUMN status SET DEFAULT 'pending'")

    # Re-add the approved_by_profile_id column
    op.add_column(
        "proposed_changes",
        sa.Column(
            "approved_by_profile_id",
            sa.UUID(),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "proposed_changes_approved_by_profile_id_fkey",
        "proposed_changes",
        "profiles",
        ["approved_by_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Re-add the approved_at column
    op.add_column(
        "proposed_changes",
        sa.Column("approved_at", sa.DateTime(), nullable=True),
    )
