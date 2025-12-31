"""
Migration script to fix playlists table schema.

Removes legacy user_id column and ensures profile_id is properly configured.
This fixes the schema mismatch from the users -> profiles transition.

Usage: uv run python -m app.db.migrate_fix_playlists
"""

import asyncio

from sqlalchemy import text

from app.db.session import engine


async def migrate() -> None:
    """Fix playlists table to use profile_id instead of user_id."""
    async with engine.begin() as conn:
        # Check if user_id column exists
        result = await conn.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'playlists' AND column_name = 'user_id'
                """
            )
        )
        has_user_id = result.fetchone() is not None

        if has_user_id:
            # Drop the old user_id column and its foreign key
            await conn.execute(
                text(
                    """
                    ALTER TABLE playlists DROP COLUMN IF EXISTS user_id CASCADE
                    """
                )
            )
            print("  Dropped legacy 'user_id' column from playlists table.")
        else:
            print("  Column 'user_id' does not exist, skipping drop.")

        # Check if profile_id exists
        result = await conn.execute(
            text(
                """
                SELECT column_name, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'playlists' AND column_name = 'profile_id'
                """
            )
        )
        profile_col = result.fetchone()

        if profile_col is None:
            # Add profile_id column
            await conn.execute(
                text(
                    """
                    ALTER TABLE playlists
                    ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE
                    """
                )
            )
            print("  Added 'profile_id' column to playlists table.")
        else:
            print("  Column 'profile_id' already exists.")

        # Make profile_id NOT NULL if it isn't already
        result = await conn.execute(
            text(
                """
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'playlists' AND column_name = 'profile_id'
                """
            )
        )
        row = result.fetchone()
        if row and row[0] == "YES":
            # First delete any playlists with null profile_id
            await conn.execute(
                text("DELETE FROM playlists WHERE profile_id IS NULL")
            )
            await conn.execute(
                text("ALTER TABLE playlists ALTER COLUMN profile_id SET NOT NULL")
            )
            print("  Made 'profile_id' NOT NULL.")
        else:
            print("  Column 'profile_id' is already NOT NULL.")

        # Ensure foreign key constraint exists
        result = await conn.execute(
            text(
                """
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_name = 'playlists'
                AND constraint_type = 'FOREIGN KEY'
                AND constraint_name LIKE '%profile_id%'
                """
            )
        )
        has_fk = result.fetchone() is not None

        if not has_fk:
            await conn.execute(
                text(
                    """
                    ALTER TABLE playlists
                    ADD CONSTRAINT playlists_profile_id_fkey
                    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
                    """
                )
            )
            print("  Added foreign key constraint for 'profile_id'.")
        else:
            print("  Foreign key constraint already exists.")

    print("\nMigration complete!")


if __name__ == "__main__":
    print("Fixing playlists table schema (user_id -> profile_id)...\n")
    asyncio.run(migrate())
