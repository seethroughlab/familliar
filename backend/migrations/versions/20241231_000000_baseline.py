"""Baseline migration - creates the initial schema.

For fresh databases: Creates all tables using SQLAlchemy models.
For existing databases: This is stamped without running (tables already exist).

Revision ID: baseline
Revises:
Create Date: 2024-12-31 00:00:00
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = "baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all tables from SQLAlchemy models."""
    from app.db.models import Base

    # Create pgvector extension
    op.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    # Create all tables from models
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    """Drop all tables - use with caution!"""
    from app.db.models import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
