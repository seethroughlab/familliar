"""Album artwork extraction and management service."""

import hashlib
from io import BytesIO
from pathlib import Path

import mutagen
from mutagen.flac import FLAC
from mutagen.id3 import ID3
from mutagen.mp4 import MP4
from PIL import Image

from app.config import settings

# Standard sizes for artwork
ARTWORK_SIZES = {
    "full": 500,      # Full size for player view
    "thumb": 200,     # Thumbnail for lists
}


def get_artwork_path(album_hash: str, size: str = "full") -> Path:
    """Get the file path for artwork.

    Args:
        album_hash: Hash identifying the album
        size: Size variant ('full' or 'thumb')

    Returns:
        Path to artwork file
    """
    suffix = f"_{size}" if size != "full" else ""
    return settings.art_path / f"{album_hash}{suffix}.jpg"


def compute_album_hash(artist: str | None, album: str | None) -> str:
    """Compute a hash for identifying unique albums.

    Uses artist + album to create a stable identifier.
    """
    key = f"{artist or 'Unknown'}::{album or 'Unknown'}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def extract_artwork(file_path: Path) -> bytes | None:
    """Extract embedded artwork from audio file.

    Supports MP3 (ID3), FLAC, and M4A (MP4).

    Returns:
        Raw image bytes or None if no artwork found.
    """
    suffix = file_path.suffix.lower()

    try:
        if suffix == ".mp3":
            return _extract_id3_artwork(file_path)
        elif suffix == ".flac":
            return _extract_flac_artwork(file_path)
        elif suffix in {".m4a", ".aac", ".mp4"}:
            return _extract_mp4_artwork(file_path)
        else:
            # Try generic mutagen approach
            audio = mutagen.File(file_path)
            if audio and hasattr(audio, "pictures") and audio.pictures:
                return audio.pictures[0].data
    except Exception as e:
        print(f"Error extracting artwork from {file_path}: {e}")

    return None


def _extract_id3_artwork(file_path: Path) -> bytes | None:
    """Extract artwork from ID3 tags (MP3)."""
    try:
        tags = ID3(file_path)
        # Look for APIC (Attached Picture) frames
        for key in tags.keys():
            if key.startswith("APIC"):
                return tags[key].data
    except Exception:
        pass
    return None


def _extract_flac_artwork(file_path: Path) -> bytes | None:
    """Extract artwork from FLAC metadata."""
    try:
        audio = FLAC(file_path)
        if audio.pictures:
            # Prefer front cover (type 3) if available
            for pic in audio.pictures:
                if pic.type == 3:  # Front cover
                    return pic.data
            # Fall back to first picture
            return audio.pictures[0].data
    except Exception:
        pass
    return None


def _extract_mp4_artwork(file_path: Path) -> bytes | None:
    """Extract artwork from MP4/M4A atoms."""
    try:
        audio = MP4(file_path)
        if audio.tags and "covr" in audio.tags:
            covers = audio.tags["covr"]
            if covers:
                return bytes(covers[0])
    except Exception:
        pass
    return None


def save_artwork(
    image_data: bytes,
    album_hash: str,
    sizes: dict[str, int] | None = None,
) -> dict[str, Path]:
    """Save artwork to disk in multiple sizes.

    Args:
        image_data: Raw image bytes
        album_hash: Hash identifying the album
        sizes: Dict of size names to max dimensions. Defaults to ARTWORK_SIZES.

    Returns:
        Dict mapping size names to saved file paths.
    """
    if sizes is None:
        sizes = ARTWORK_SIZES

    # Ensure art directory exists
    settings.art_path.mkdir(parents=True, exist_ok=True)

    saved_paths: dict[str, Path] = {}

    try:
        # Open image with Pillow
        img = Image.open(BytesIO(image_data))

        # Convert to RGB if necessary (for JPEG output)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        for size_name, max_dim in sizes.items():
            output_path = get_artwork_path(album_hash, size_name)

            # Resize maintaining aspect ratio
            img_copy = img.copy()
            img_copy.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            # Save as JPEG
            img_copy.save(output_path, "JPEG", quality=85, optimize=True)
            saved_paths[size_name] = output_path

    except Exception as e:
        print(f"Error saving artwork: {e}")

    return saved_paths


def extract_and_save_artwork(
    file_path: Path,
    artist: str | None,
    album: str | None,
) -> str | None:
    """Extract artwork from file and save to disk.

    Args:
        file_path: Path to audio file
        artist: Artist name for album hash
        album: Album name for album hash

    Returns:
        Album hash if artwork was saved, None otherwise.
    """
    # Compute album hash
    album_hash = compute_album_hash(artist, album)

    # Check if artwork already exists
    full_path = get_artwork_path(album_hash, "full")
    if full_path.exists():
        return album_hash

    # Extract artwork from file
    image_data = extract_artwork(file_path)
    if not image_data:
        return None

    # Save artwork
    saved = save_artwork(image_data, album_hash)
    if saved:
        return album_hash

    return None
