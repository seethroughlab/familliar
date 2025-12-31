"""add file_hash index

Revision ID: 54718ec827f6
Revises: baseline
Create Date: 2025-12-31 14:55:19.935331
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '54718ec827f6'
down_revision: Union[str, None] = 'baseline'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add index on file_hash for hash-based track matching
    op.create_index(op.f('ix_tracks_file_hash'), 'tracks', ['file_hash'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_tracks_file_hash'), table_name='tracks')
