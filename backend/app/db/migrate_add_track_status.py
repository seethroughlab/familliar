"""
Migration script to add track status columns for safe library scanning.

These columns prevent catastrophic deletion when library path is misconfigured.
Missing tracks are marked as 'missing' instead of deleted, allowing recovery.

Usage: uv run python -m app.db.migrate_add_track_status
"""

import asyncio

from sqlalchemy import text

from app.db.session import engine


async def migrate() -> None:
    """Add status and missing_since columns to tracks table."""
    async with engine.begin() as conn:
        # Check if columns already exist
        result = await conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'tracks' AND column_name IN ('status', 'missing_since')
                """
            )
        )
        existing_columns = {row[0] for row in result.fetchall()}

        if "status" not in existing_columns:
            # Create the enum type first
            await conn.execute(
                text(
                    """
                    DO $$ BEGIN
                        CREATE TYPE trackstatus AS ENUM ('active', 'missing', 'pending_deletion');
                    EXCEPTION
                        WHEN duplicate_object THEN null;
                    END $$;
                    """
                )
            )
            print("  Created trackstatus enum type.")

            # Add the status column with default 'active'
            await conn.execute(
                text(
                    """
                    ALTER TABLE tracks
                    ADD COLUMN status trackstatus NOT NULL DEFAULT 'active'
                    """
                )
            )
            print("  Added 'status' column to tracks table.")

            # Create index on status for efficient filtering
            await conn.execute(
                text(
                    """
                    CREATE INDEX ix_tracks_status ON tracks (status)
                    """
                )
            )
            print("  Created index on 'status' column.")
        else:
            print("  Column 'status' already exists, skipping.")

        if "missing_since" not in existing_columns:
            await conn.execute(
                text(
                    """
                    ALTER TABLE tracks
                    ADD COLUMN missing_since TIMESTAMP
                    """
                )
            )
            print("  Added 'missing_since' column to tracks table.")
        else:
            print("  Column 'missing_since' already exists, skipping.")

    print("\nMigration complete!")


if __name__ == "__main__":
    print("Adding track status columns for safe library scanning...\n")
    asyncio.run(migrate())
