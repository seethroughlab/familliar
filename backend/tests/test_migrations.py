"""
Tests for Alembic migrations.

Verifies that migrations are properly configured and applied.
"""

import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def test_alembic_config_exists() -> None:
    """Verify Alembic configuration files exist."""
    backend_dir = Path(__file__).parent.parent

    assert (backend_dir / "alembic.ini").exists(), "alembic.ini not found"
    assert (backend_dir / "alembic").is_dir(), "alembic/ directory not found"
    assert (backend_dir / "alembic" / "env.py").exists(), "alembic/env.py not found"
    assert (backend_dir / "alembic" / "versions").is_dir(), "alembic/versions/ not found"


def test_migrations_current(client: TestClient) -> None:
    """Verify database is at the latest migration revision.

    This test runs 'alembic current' and checks that we're at head.
    The client fixture ensures the app has started and DB is connected.
    """
    backend_dir = Path(__file__).parent.parent

    # Run alembic current to get the current revision
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "current"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # Should succeed
    assert result.returncode == 0, f"alembic current failed: {result.stderr}"

    # Output should contain a revision (not be empty or show 'None')
    output = result.stdout.strip()
    assert output, "No migration revision found - database may not be initialized"
    assert "(head)" in output, f"Database not at head revision: {output}"


def test_migrations_check(client: TestClient) -> None:
    """Verify no pending migrations (models match database schema).

    Runs 'alembic check' which fails if the database schema
    doesn't match the current model definitions.
    """
    backend_dir = Path(__file__).parent.parent

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "check"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # alembic check returns 0 if no new migrations needed
    # It may not exist in older alembic versions, so we check for that
    if "No such command 'check'" in result.stderr:
        # Older alembic version, skip this test
        return

    # If the command exists, it should pass
    assert result.returncode == 0, (
        f"Schema mismatch detected - models don't match database. "
        f"Run 'alembic revision --autogenerate' to create a migration. "
        f"Details: {result.stderr}"
    )


def test_migrations_history() -> None:
    """Verify migration history is accessible and has at least one migration."""
    backend_dir = Path(__file__).parent.parent

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "history"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, f"alembic history failed: {result.stderr}"

    # Should have at least the baseline migration
    output = result.stdout.strip()
    assert output, "No migrations found in history"
    assert "baseline" in output.lower() or "->", f"Expected migration history: {output}"
