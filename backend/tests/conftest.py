"""
Test fixtures for Familiar backend tests.

Uses FastAPI's synchronous TestClient which properly handles async endpoints
without the event loop complexities of using AsyncClient directly.
"""

from collections.abc import Generator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client() -> Generator[TestClient, None, None]:
    """Provide a test client for the entire test session.

    Using session scope with proper context management.
    TestClient handles async endpoints synchronously, avoiding event loop issues.
    """
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture(scope="function")
def test_profile(client: TestClient) -> dict:
    """Create a fresh test profile for each test function.

    Returns the profile data including 'id' for use in headers.
    """
    response = client.post(
        "/api/v1/profiles",
        json={"name": f"Test User {uuid4().hex[:8]}"},
    )
    assert response.status_code == 201, f"Failed to create profile: {response.text}"
    return response.json()


def make_profile_headers(profile: dict) -> dict[str, str]:
    """Create headers with profile ID for authenticated requests."""
    return {"X-Profile-ID": str(profile["id"])}
