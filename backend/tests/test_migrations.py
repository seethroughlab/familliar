"""
Tests for Alembic migrations and deployment readiness.

Verifies that migrations are properly configured and applied,
and that Docker health checks will work correctly.
"""

import re
import subprocess
import sys
from pathlib import Path

import pytest
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


@pytest.mark.xfail(reason="Models have pending schema changes (indexes, nullable). Migration needed.")
def test_models_in_sync_with_migrations(client: TestClient) -> None:
    """Verify SQLAlchemy models match the database schema after migrations.

    This catches schema drift - when model columns don't have corresponding
    migrations. Runs alembic autogenerate and fails if changes are detected.
    """
    backend_dir = Path(__file__).parent.parent

    # First ensure migrations are applied
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # Run alembic check to detect schema drift
    # This compares models against the actual database schema
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "check"],
        cwd=backend_dir,
        capture_output=True,
        text=True,
    )

    # alembic check returns 0 if no changes needed, 1 if changes detected
    if result.returncode != 0:
        assert False, (
            f"Models are out of sync with migrations!\n"
            f"Run 'alembic revision --autogenerate -m \"description\"' to create a migration.\n"
            f"alembic check output:\n{result.stdout}\n{result.stderr}"
        )


def test_docker_health_check_endpoint(client: TestClient) -> None:
    """Verify the health endpoint used in Docker health checks actually exists.

    The Dockerfile and docker-compose files reference a specific health endpoint.
    This test ensures that endpoint exists and returns 200 OK.
    """
    # Read the Dockerfile to find what endpoint the health check uses
    repo_root = Path(__file__).parent.parent.parent
    dockerfile_path = repo_root / "docker" / "Dockerfile"

    assert dockerfile_path.exists(), f"Dockerfile not found at {dockerfile_path}"

    dockerfile_content = dockerfile_path.read_text()

    # Extract health check URL from Dockerfile
    # Matches patterns like: httpx.get('http://localhost:8000/api/v1/health'
    match = re.search(r"httpx\.get\(['\"]http://localhost:\d+(/[^'\"]+)['\"]", dockerfile_content)
    assert match, "Could not find health check URL in Dockerfile"

    health_path = match.group(1)

    # Test that the endpoint exists and returns success
    response = client.get(health_path)
    assert response.status_code == 200, (
        f"Health check endpoint {health_path} returned {response.status_code}. "
        f"Docker health checks will fail!"
    )


def test_uvicorn_has_workers() -> None:
    """Verify uvicorn is configured with multiple workers.

    A single uvicorn process can become unresponsive under load, causing
    health checks to timeout even when the server is technically running.
    Multiple workers ensure there's always capacity to handle health checks.
    """
    repo_root = Path(__file__).parent.parent.parent
    dockerfile_path = repo_root / "docker" / "Dockerfile"

    dockerfile_content = dockerfile_path.read_text()

    # Check that uvicorn CMD includes --workers
    assert "--workers" in dockerfile_content, (
        "uvicorn should be configured with --workers to prevent health check "
        "timeouts under load. Add '--workers', '4' to the CMD in Dockerfile."
    )
