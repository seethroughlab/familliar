"""Smart playlist service for rule-based auto-updating playlists."""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Float, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import SmartPlaylist, Track, TrackAnalysis


# Fields that exist directly on the Track model
TRACK_FIELDS = {
    "title", "artist", "album", "album_artist", "genre", "year",
    "track_number", "disc_number", "duration_seconds", "format",
    "created_at", "album_type",
}

# Fields that exist in TrackAnalysis.features JSONB
ANALYSIS_FIELDS = {
    "bpm", "key", "energy", "valence", "danceability",
    "acousticness", "instrumentalness", "speechiness",
    "loudness_db", "dynamic_range_db",
}

# Valid operators
OPERATORS = {
    "equals", "not_equals", "contains", "not_contains",
    "starts_with", "ends_with",
    "greater_than", "less_than", "greater_or_equal", "less_or_equal",
    "between", "in", "not_in",
    "is_empty", "is_not_empty",
    "within_days",  # For date fields
}


class SmartPlaylistService:
    """Service for managing and executing smart playlists."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        user_id: UUID,
        name: str,
        rules: list[dict],
        description: str | None = None,
        match_mode: str = "all",
        order_by: str = "title",
        order_direction: str = "asc",
        max_tracks: int | None = None,
    ) -> SmartPlaylist:
        """Create a new smart playlist."""
        # Validate rules
        self._validate_rules(rules)

        playlist = SmartPlaylist(
            user_id=user_id,
            name=name,
            description=description,
            rules=rules,
            match_mode=match_mode,
            order_by=order_by,
            order_direction=order_direction,
            max_tracks=max_tracks,
        )

        self.db.add(playlist)
        await self.db.commit()
        await self.db.refresh(playlist)

        # Refresh to get initial count
        await self.refresh_playlist(playlist)

        return playlist

    async def update(
        self,
        playlist: SmartPlaylist,
        **kwargs,
    ) -> SmartPlaylist:
        """Update a smart playlist."""
        if "rules" in kwargs:
            self._validate_rules(kwargs["rules"])

        for key, value in kwargs.items():
            if hasattr(playlist, key):
                setattr(playlist, key, value)

        await self.db.commit()
        await self.db.refresh(playlist)

        # Refresh to update count
        await self.refresh_playlist(playlist)

        return playlist

    async def delete(self, playlist: SmartPlaylist) -> None:
        """Delete a smart playlist."""
        await self.db.delete(playlist)
        await self.db.commit()

    async def get_by_id(self, playlist_id: UUID, user_id: UUID) -> SmartPlaylist | None:
        """Get a smart playlist by ID."""
        result = await self.db.execute(
            select(SmartPlaylist).where(
                SmartPlaylist.id == playlist_id,
                SmartPlaylist.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_all_for_user(self, user_id: UUID) -> list[SmartPlaylist]:
        """Get all smart playlists for a user."""
        result = await self.db.execute(
            select(SmartPlaylist)
            .where(SmartPlaylist.user_id == user_id)
            .order_by(SmartPlaylist.name)
        )
        return list(result.scalars().all())

    async def get_tracks(
        self,
        playlist: SmartPlaylist,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[Track]:
        """Get tracks matching the smart playlist rules."""
        query = self._build_query(playlist)

        # Apply ordering
        order_column = self._get_order_column(playlist.order_by)
        if playlist.order_direction == "desc":
            query = query.order_by(order_column.desc())
        else:
            query = query.order_by(order_column.asc())

        # Apply limits
        effective_limit = limit
        if playlist.max_tracks:
            effective_limit = min(limit or playlist.max_tracks, playlist.max_tracks)

        if effective_limit:
            query = query.limit(effective_limit)
        if offset:
            query = query.offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_track_count(self, playlist: SmartPlaylist) -> int:
        """Get the count of tracks matching the rules."""
        query = self._build_query(playlist)
        count_query = select(func.count()).select_from(query.subquery())
        result = await self.db.execute(count_query)
        return result.scalar() or 0

    async def refresh_playlist(self, playlist: SmartPlaylist) -> int:
        """Refresh the cached track count."""
        count = await self.get_track_count(playlist)
        playlist.cached_track_count = count
        playlist.last_refreshed_at = datetime.utcnow()
        await self.db.commit()
        return count

    def _validate_rules(self, rules: list[dict]) -> None:
        """Validate rule structure."""
        for rule in rules:
            if "field" not in rule:
                raise ValueError("Rule missing 'field'")
            if "operator" not in rule:
                raise ValueError("Rule missing 'operator'")

            field = rule["field"]
            operator = rule["operator"]

            # Validate field
            if field not in TRACK_FIELDS and field not in ANALYSIS_FIELDS:
                raise ValueError(f"Unknown field: {field}")

            # Validate operator
            if operator not in OPERATORS:
                raise ValueError(f"Unknown operator: {operator}")

            # Validate value presence (except for is_empty/is_not_empty)
            if operator not in ("is_empty", "is_not_empty") and "value" not in rule:
                raise ValueError(f"Rule with operator '{operator}' requires 'value'")

    def _build_query(self, playlist: SmartPlaylist):
        """Build SQLAlchemy query from playlist rules."""
        # Start with base query
        # Join with latest analysis for feature queries
        needs_analysis = any(
            rule["field"] in ANALYSIS_FIELDS for rule in playlist.rules
        )

        if needs_analysis:
            # Subquery to get latest analysis per track
            latest_analysis = (
                select(
                    TrackAnalysis.track_id,
                    func.max(TrackAnalysis.version).label("max_version"),
                )
                .group_by(TrackAnalysis.track_id)
                .subquery()
            )

            query = (
                select(Track)
                .join(
                    latest_analysis,
                    Track.id == latest_analysis.c.track_id,
                )
                .join(
                    TrackAnalysis,
                    and_(
                        Track.id == TrackAnalysis.track_id,
                        TrackAnalysis.version == latest_analysis.c.max_version,
                    ),
                )
            )
        else:
            query = select(Track)

        # Build conditions from rules
        conditions = []
        for rule in playlist.rules:
            condition = self._build_condition(rule, needs_analysis)
            if condition is not None:
                conditions.append(condition)

        # Apply conditions with match mode
        if conditions:
            if playlist.match_mode == "any":
                query = query.where(or_(*conditions))
            else:  # "all"
                query = query.where(and_(*conditions))

        return query

    def _build_condition(self, rule: dict, has_analysis_join: bool):
        """Build a single condition from a rule."""
        field = rule["field"]
        operator = rule["operator"]
        value = rule.get("value")

        # Get the column or JSONB path
        if field in TRACK_FIELDS:
            column = getattr(Track, field)
        elif field in ANALYSIS_FIELDS and has_analysis_join:
            # Access JSONB field
            column = cast(TrackAnalysis.features[field].astext, Float)
        else:
            return None

        # Build condition based on operator
        if operator == "equals":
            return column == value
        elif operator == "not_equals":
            return column != value
        elif operator == "contains":
            return column.ilike(f"%{value}%")
        elif operator == "not_contains":
            return ~column.ilike(f"%{value}%")
        elif operator == "starts_with":
            return column.ilike(f"{value}%")
        elif operator == "ends_with":
            return column.ilike(f"%{value}")
        elif operator == "greater_than":
            return column > value
        elif operator == "less_than":
            return column < value
        elif operator == "greater_or_equal":
            return column >= value
        elif operator == "less_or_equal":
            return column <= value
        elif operator == "between":
            if isinstance(value, list) and len(value) == 2:
                return and_(column >= value[0], column <= value[1])
            return None
        elif operator == "in":
            if isinstance(value, list):
                return column.in_(value)
            return None
        elif operator == "not_in":
            if isinstance(value, list):
                return ~column.in_(value)
            return None
        elif operator == "is_empty":
            return or_(column.is_(None), column == "")
        elif operator == "is_not_empty":
            return and_(column.isnot(None), column != "")
        elif operator == "within_days":
            if isinstance(value, int):
                cutoff = datetime.utcnow() - timedelta(days=value)
                return column >= cutoff
            return None

        return None

    def _get_order_column(self, order_by: str):
        """Get the column to order by."""
        if order_by in TRACK_FIELDS:
            return getattr(Track, order_by)
        elif order_by in ANALYSIS_FIELDS:
            return cast(TrackAnalysis.features[order_by].astext, Float)
        else:
            return Track.title  # Default


async def get_smart_playlist_service(db: AsyncSession) -> SmartPlaylistService:
    """Factory function for dependency injection."""
    return SmartPlaylistService(db)
