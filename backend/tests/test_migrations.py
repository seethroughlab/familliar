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
    assert (backend_dir / "migrations").is_dir(), "migrations/ directory not found"
    assert (backend_dir / "migrations" / "env.py").exists(), "migrations/env.py not found"
    assert (backend_dir / "migrations" / "versions").is_dir(), "migrations/versions/ not found"


def test_migrations_upgrade(client: TestClient) -> None:
    """Verify migrations can be applied successfully.

    This test runs 'alembic upgrade head' to ensure migrations apply cleanly.
    The client fixture ensures the app has started and DB is connected.
    """
    backend_dir = Path(__file__).parent.parent

    # Run alembic upgrade head
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # Should succeed
    assert result.returncode == 0, f"alembic upgrade head failed: {result.stderr}"


def test_migrations_current_at_head(client: TestClient) -> None:
    """Verify database is at the latest migration revision after upgrade.

    This test runs 'alembic current' and checks that we're at head.
    Depends on test_migrations_upgrade running first.
    """
    backend_dir = Path(__file__).parent.parent

    # First ensure we're at head
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # Run alembic current to get the current revision
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "current"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # Should succeed
    assert result.returncode == 0, f"alembic current failed: {result.stderr}"

    # Output should contain a revision at head
    output = result.stdout.strip()
    assert output, "No migration revision found after upgrade"
    assert "(head)" in output, f"Database not at head revision: {output}"


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
    assert "baseline" in output.lower() or "->" in output, f"Expected migration history: {output}"
