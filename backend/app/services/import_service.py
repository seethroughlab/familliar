"""Music import service for handling zip files and folder imports."""

import logging
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import AUDIO_EXTENSIONS, settings

logger = logging.getLogger(__name__)


class ImportError(Exception):
    """Import operation failed."""
    pass


class ImportService:
    """Handles importing music files from zip archives or folders."""

    def __init__(self, library_path: Path | None = None):
        self.library_path = library_path or settings.music_library_paths[0]
        self.imports_dir = self.library_path / "_imports"

    def create_import_dir(self) -> Path:
        """Create a timestamped import directory."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        import_dir = self.imports_dir / timestamp
        import_dir.mkdir(parents=True, exist_ok=True)
        return import_dir

    def extract_zip(self, zip_path: Path, dest_dir: Path) -> list[Path]:
        """Extract a zip file and return list of extracted audio files.

        Args:
            zip_path: Path to the zip file
            dest_dir: Directory to extract to

        Returns:
            List of extracted audio file paths
        """
        logger.info(f"Extracting zip: {zip_path}")

        if not zipfile.is_zipfile(zip_path):
            raise ImportError(f"Not a valid zip file: {zip_path}")

        extracted_audio = []

        with zipfile.ZipFile(zip_path, 'r') as zf:
            # Check for malicious paths (zip slip vulnerability)
            for member in zf.namelist():
                member_path = Path(member)
                if member_path.is_absolute() or '..' in member_path.parts:
                    raise ImportError(f"Unsafe path in zip: {member}")

            # Extract all files
            zf.extractall(dest_dir)

            # Find audio files
            for member in zf.namelist():
                member_path = dest_dir / member
                if member_path.is_file():
                    ext = member_path.suffix.lower()
                    if ext in AUDIO_EXTENSIONS:
                        extracted_audio.append(member_path)
                        logger.info(f"  Found audio: {member_path.name}")

        logger.info(f"Extracted {len(extracted_audio)} audio files from zip")
        return extracted_audio

    def process_upload(self, file_path: Path, original_filename: str) -> dict[str, Any]:
        """Process an uploaded file (zip or audio).

        Args:
            file_path: Path to the uploaded file (in temp location)
            original_filename: Original filename from upload

        Returns:
            Dict with import results
        """
        import_dir = self.create_import_dir()

        try:
            if original_filename.lower().endswith('.zip'):
                # Extract zip file
                audio_files = self.extract_zip(file_path, import_dir)
            else:
                # Single audio file
                ext = Path(original_filename).suffix.lower()
                if ext not in AUDIO_EXTENSIONS:
                    raise ImportError(f"Unsupported file type: {ext}")

                # Move to import directory
                dest = import_dir / original_filename
                shutil.move(str(file_path), str(dest))
                audio_files = [dest]
                logger.info(f"Imported single file: {original_filename}")

            return {
                "status": "success",
                "import_path": str(import_dir),
                "files_found": len(audio_files),
                "files": [str(f.relative_to(import_dir)) for f in audio_files],
            }

        except Exception as e:
            # Clean up on failure
            if import_dir.exists():
                shutil.rmtree(import_dir, ignore_errors=True)
            raise ImportError(f"Import failed: {str(e)}") from e

    def get_recent_imports(self, limit: int = 10) -> list[dict[str, Any]]:
        """Get list of recent import directories."""
        if not self.imports_dir.exists():
            return []

        imports = []
        for import_dir in sorted(self.imports_dir.iterdir(), reverse=True)[:limit]:
            if import_dir.is_dir():
                # Count audio files
                audio_count = sum(
                    1 for f in import_dir.rglob("*")
                    if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS
                )

                imports.append({
                    "name": import_dir.name,
                    "path": str(import_dir),
                    "file_count": audio_count,
                    "created_at": datetime.strptime(
                        import_dir.name, "%Y%m%d_%H%M%S"
                    ).isoformat() if import_dir.name[0].isdigit() else None,
                })

        return imports


def save_upload_to_temp(content: bytes, filename: str) -> Path:
    """Save uploaded file content to a temporary file.

    Args:
        content: File content as bytes
        filename: Original filename (for extension)

    Returns:
        Path to temporary file
    """
    suffix = Path(filename).suffix
    fd, temp_path = tempfile.mkstemp(suffix=suffix)

    try:
        with open(fd, 'wb') as f:
            f.write(content)
    except Exception:
        Path(temp_path).unlink(missing_ok=True)
        raise

    return Path(temp_path)
