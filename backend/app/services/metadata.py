"""Metadata extraction service using mutagen."""

import logging
from pathlib import Path
from typing import Any

import mutagen

logger = logging.getLogger(__name__)
from mutagen.easyid3 import EasyID3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.oggvorbis import OggVorbis


def extract_metadata(file_path: Path) -> dict[str, Any]:
    """Extract audio metadata from file tags.

    Supports MP3 (ID3), FLAC, M4A/AAC (MP4), and OGG.

    Returns:
        Dict with extracted metadata fields.
    """
    metadata: dict[str, Any] = {
        "title": None,
        "artist": None,
        "album": None,
        "album_artist": None,
        "track_number": None,
        "disc_number": None,
        "year": None,
        "genre": None,
        "duration_seconds": None,
        "sample_rate": None,
        "bit_depth": None,
        "bitrate": None,
        "format": None,
    }

    try:
        audio = mutagen.File(file_path, easy=True)  # type: ignore[attr-defined]
        if audio is None:
            return metadata

        # Determine format
        suffix = file_path.suffix.lower()
        metadata["format"] = suffix.lstrip(".")

        # Get duration from audio info
        if hasattr(audio, "info") and audio.info:
            metadata["duration_seconds"] = audio.info.length
            if hasattr(audio.info, "sample_rate"):
                metadata["sample_rate"] = audio.info.sample_rate
            if hasattr(audio.info, "bits_per_sample"):
                metadata["bit_depth"] = audio.info.bits_per_sample
            if hasattr(audio.info, "bitrate"):
                metadata["bitrate"] = audio.info.bitrate

        # Extract tags based on format
        if suffix == ".mp3":
            metadata.update(_extract_id3_tags(file_path))
        elif suffix == ".flac":
            metadata.update(_extract_flac_tags(file_path))
        elif suffix in {".m4a", ".aac", ".mp4"}:
            metadata.update(_extract_mp4_tags(file_path))
        elif suffix == ".ogg":
            metadata.update(_extract_ogg_tags(file_path))
        else:
            # Try easy interface as fallback
            metadata.update(_extract_easy_tags(audio))

    except Exception as e:
        # Log error but return partial metadata
        logger.warning(f"Error extracting metadata from {file_path}: {e}")

    return metadata


def _extract_easy_tags(audio: Any) -> dict[str, Any]:
    """Extract tags using mutagen's easy interface."""
    tags: dict[str, Any] = {}

    def get_first(key: str) -> str | None:
        val = audio.get(key)
        if val and len(val) > 0:
            return str(val[0])
        return None

    tags["title"] = get_first("title")
    tags["artist"] = get_first("artist")
    tags["album"] = get_first("album")
    tags["album_artist"] = get_first("albumartist") or get_first("album artist")
    tags["genre"] = get_first("genre")

    # Parse track number (may be "3/12" format)
    track_str = get_first("tracknumber")
    if track_str:
        tags["track_number"] = _parse_number(track_str)

    disc_str = get_first("discnumber")
    if disc_str:
        tags["disc_number"] = _parse_number(disc_str)

    # Parse year
    date_str = get_first("date") or get_first("year")
    if date_str:
        tags["year"] = _parse_year(date_str)

    return tags


def _extract_id3_tags(file_path: Path) -> dict[str, Any]:
    """Extract ID3 tags from MP3 files."""
    tags: dict[str, Any] = {}

    try:
        audio = EasyID3(file_path)  # type: ignore[no-untyped-call]
        return _extract_easy_tags(audio)
    except Exception:
        # Fall back to mutagen.File
        audio = mutagen.File(file_path, easy=True)  # type: ignore[attr-defined]
        if audio:
            return _extract_easy_tags(audio)

    return tags


def _extract_flac_tags(file_path: Path) -> dict[str, Any]:
    """Extract Vorbis comments from FLAC files."""
    tags: dict[str, Any] = {}

    try:
        audio = FLAC(file_path)

        def get_first(key: str) -> str | None:
            val = audio.get(key)
            if val and len(val) > 0:
                return str(val[0])
            return None

        tags["title"] = get_first("title")
        tags["artist"] = get_first("artist")
        tags["album"] = get_first("album")
        tags["album_artist"] = get_first("albumartist") or get_first("album artist")
        tags["genre"] = get_first("genre")

        track_str = get_first("tracknumber")
        if track_str:
            tags["track_number"] = _parse_number(track_str)

        disc_str = get_first("discnumber")
        if disc_str:
            tags["disc_number"] = _parse_number(disc_str)

        date_str = get_first("date") or get_first("year")
        if date_str:
            tags["year"] = _parse_year(date_str)

        # FLAC-specific: bit depth from audio info
        if audio.info:
            tags["bit_depth"] = audio.info.bits_per_sample
            tags["sample_rate"] = audio.info.sample_rate

    except Exception as e:
        logger.warning(f"Error reading FLAC tags: {e}")

    return tags


def _extract_mp4_tags(file_path: Path) -> dict[str, Any]:
    """Extract MP4/M4A atom tags."""
    tags: dict[str, Any] = {}

    try:
        audio = MP4(file_path)

        def get_first(key: str) -> str | None:
            val = audio.tags.get(key) if audio.tags else None
            if val and len(val) > 0:
                return str(val[0])
            return None

        # MP4 uses different tag names
        tags["title"] = get_first("\xa9nam")
        tags["artist"] = get_first("\xa9ART")
        tags["album"] = get_first("\xa9alb")
        tags["album_artist"] = get_first("aART")
        tags["genre"] = get_first("\xa9gen")

        # Track number is stored as tuple (track, total)
        trkn = audio.tags.get("trkn") if audio.tags else None
        if trkn and len(trkn) > 0:
            tags["track_number"] = trkn[0][0]

        disk = audio.tags.get("disk") if audio.tags else None
        if disk and len(disk) > 0:
            tags["disc_number"] = disk[0][0]

        date_str = get_first("\xa9day")
        if date_str:
            tags["year"] = _parse_year(date_str)

    except Exception as e:
        logger.warning(f"Error reading MP4 tags: {e}")

    return tags


def _extract_ogg_tags(file_path: Path) -> dict[str, Any]:
    """Extract Vorbis comments from OGG files."""
    tags: dict[str, Any] = {}

    try:
        audio = OggVorbis(file_path)  # type: ignore[no-untyped-call]
        return _extract_easy_tags(audio)
    except Exception as e:
        logger.warning(f"Error reading OGG tags: {e}")

    return tags


def _parse_number(value: str) -> int | None:
    """Parse track/disc number from string like '3' or '3/12'."""
    try:
        # Handle "3/12" format
        if "/" in value:
            value = value.split("/")[0]
        return int(value.strip())
    except (ValueError, AttributeError):
        return None


def _parse_year(value: str) -> int | None:
    """Parse year from string like '2023' or '2023-05-10'."""
    try:
        # Take first 4 characters as year
        return int(value[:4])
    except (ValueError, AttributeError):
        return None
