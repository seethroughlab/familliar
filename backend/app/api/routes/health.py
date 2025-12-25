"""Health check endpoints."""

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DbSession

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    """Basic liveness check."""
    return {"status": "healthy"}


@router.get("/health/db")
async def db_health_check(db: DbSession) -> dict:
    """Database connectivity check."""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}
