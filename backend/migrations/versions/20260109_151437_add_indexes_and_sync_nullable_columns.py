"""add indexes and sync nullable columns

Revision ID: 73a97e82b273
Revises: add_metadata_editing
Create Date: 2026-01-09 15:14:37.806389
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '73a97e82b273'
down_revision: str | None = 'add_metadata_editing'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Sync nullable constraints
    op.alter_column('artist_info', 'similar_artists',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               nullable=False,
               existing_server_default=sa.text("'[]'::jsonb"))
    op.alter_column('artist_info', 'tags',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               nullable=False,
               existing_server_default=sa.text("'[]'::jsonb"))
    op.alter_column('artist_info', 'fetched_at',
               existing_type=postgresql.TIMESTAMP(),
               nullable=False,
               existing_server_default=sa.text('now()'))
    op.alter_column('playlists', 'profile_id',
               existing_type=sa.UUID(),
               nullable=False)
    op.alter_column('profile_favorites', 'favorited_at',
               existing_type=postgresql.TIMESTAMP(),
               nullable=False,
               existing_server_default=sa.text('now()'))
    op.alter_column('profile_play_history', 'play_count',
               existing_type=sa.INTEGER(),
               nullable=False,
               existing_server_default=sa.text('0'))
    op.alter_column('profile_play_history', 'total_play_seconds',
               existing_type=sa.DOUBLE_PRECISION(precision=53),
               nullable=False,
               existing_server_default=sa.text('0.0'))
    op.alter_column('smart_playlists', 'profile_id',
               existing_type=sa.UUID(),
               nullable=False)

    # Change acoustid from VARCHAR(100) to Text
    op.alter_column('track_analysis', 'acoustid',
               existing_type=sa.VARCHAR(length=100),
               type_=sa.Text(),
               existing_nullable=True)

    # Note: ix_tracks_status already created by baseline migration (model has index=True)


def downgrade() -> None:
    # Revert acoustid column type
    op.alter_column('track_analysis', 'acoustid',
               existing_type=sa.Text(),
               type_=sa.VARCHAR(length=100),
               existing_nullable=True)

    # Revert nullable constraints
    op.alter_column('smart_playlists', 'profile_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.alter_column('profile_play_history', 'total_play_seconds',
               existing_type=sa.DOUBLE_PRECISION(precision=53),
               nullable=True,
               existing_server_default=sa.text('0.0'))
    op.alter_column('profile_play_history', 'play_count',
               existing_type=sa.INTEGER(),
               nullable=True,
               existing_server_default=sa.text('0'))
    op.alter_column('profile_favorites', 'favorited_at',
               existing_type=postgresql.TIMESTAMP(),
               nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('playlists', 'profile_id',
               existing_type=sa.UUID(),
               nullable=True)
    op.alter_column('artist_info', 'fetched_at',
               existing_type=postgresql.TIMESTAMP(),
               nullable=True,
               existing_server_default=sa.text('now()'))
    op.alter_column('artist_info', 'tags',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               nullable=True,
               existing_server_default=sa.text("'[]'::jsonb"))
    op.alter_column('artist_info', 'similar_artists',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               nullable=True,
               existing_server_default=sa.text("'[]'::jsonb"))
