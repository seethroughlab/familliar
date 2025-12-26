"""Audio analysis service using CLAP embeddings and librosa features."""

import logging
import os
from functools import lru_cache
from pathlib import Path

import acoustid
import librosa
import numpy as np
import torch

logger = logging.getLogger(__name__)


def get_acoustid_api_key() -> str:
    """Get AcoustID API key from environment or app settings."""
    # First check environment variable
    key = os.environ.get("ACOUSTID_API_KEY", "")
    if key:
        return key

    # Then check app settings
    try:
        from app.services.app_settings import get_app_settings_service
        settings = get_app_settings_service().get()
        return settings.acoustid_api_key or ""
    except Exception:
        return ""

# Lazy load the CLAP model to avoid loading on import
_clap_model = None
_clap_processor = None


def get_device() -> str:
    """Get the best available device for inference.

    Note: MPS (Apple Silicon) doesn't work well with forked processes
    (like Celery workers), so we use CPU for workers.
    """
    import os

    # Check if we're in a forked process (Celery worker)
    # MPS doesn't work after fork, so use CPU
    if os.environ.get("FORKED_BY_MULTIPROCESSING"):
        return "cpu"

    if torch.cuda.is_available():
        return "cuda"
    # Skip MPS for now due to fork issues
    # elif torch.backends.mps.is_available():
    #     return "mps"
    return "cpu"


@lru_cache(maxsize=1)
def load_clap_model():
    """Load the CLAP model (cached)."""
    global _clap_model, _clap_processor

    if _clap_model is None:
        from transformers import ClapModel, ClapProcessor

        model_name = "laion/clap-htsat-unfused"
        logger.info(f"Loading CLAP model: {model_name}")

        device = get_device()
        logger.info(f"Using device: {device}")

        _clap_processor = ClapProcessor.from_pretrained(model_name)
        _clap_model = ClapModel.from_pretrained(model_name)
        _clap_model = _clap_model.to(device)
        _clap_model.eval()

        logger.info("CLAP model loaded successfully")

    return _clap_model, _clap_processor


def extract_embedding(file_path: Path, target_sr: int = 48000) -> list[float] | None:
    """Extract CLAP audio embedding from file.

    Args:
        file_path: Path to audio file
        target_sr: Target sample rate for CLAP (48kHz recommended)

    Returns:
        512-dimensional embedding as list of floats, or None on error
    """
    try:
        # Load audio file
        audio, sr = librosa.load(file_path, sr=target_sr, mono=True)

        # Limit to 10 seconds for embedding (CLAP works best with short clips)
        max_samples = target_sr * 10
        if len(audio) > max_samples:
            # Take middle section
            start = (len(audio) - max_samples) // 2
            audio = audio[start:start + max_samples]

        # Load model
        model, processor = load_clap_model()
        device = get_device()

        # Process audio
        inputs = processor(
            audio=audio,
            sampling_rate=target_sr,
            return_tensors="pt",
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}

        # Get embedding
        with torch.no_grad():
            audio_embed = model.get_audio_features(**inputs)

        # Convert to list
        embedding = audio_embed.cpu().numpy().flatten().tolist()

        return embedding

    except Exception as e:
        logger.error(f"Error extracting embedding from {file_path}: {e}")
        return None


def extract_features(file_path: Path) -> dict:
    """Extract audio features using librosa.

    Args:
        file_path: Path to audio file

    Returns:
        Dict with extracted features
    """
    features = {
        "bpm": None,
        "key": None,
        "energy": None,
        "danceability": None,
        "acousticness": None,
        "instrumentalness": None,
        "valence": None,
        "speechiness": None,
    }

    try:
        # Load audio
        y, sr = librosa.load(file_path, sr=22050, mono=True)

        # BPM detection
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        features["bpm"] = float(tempo) if not isinstance(tempo, np.ndarray) else float(tempo[0])

        # Key detection using chroma features
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key_idx = np.argmax(np.mean(chroma, axis=1))
        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        features["key"] = key_names[key_idx]

        # Energy (RMS energy normalized)
        rms = librosa.feature.rms(y=y)[0]
        features["energy"] = float(np.mean(rms))

        # Spectral features for danceability approximation
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        _spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]  # For future use

        # Danceability: combination of tempo regularity and beat strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
        features["danceability"] = float(np.mean(pulse))

        # Zero crossing rate (indicator of percussiveness/noisiness)
        zcr = librosa.feature.zero_crossing_rate(y)[0]

        # MFCC for timbral features (computed for future embedding use)
        _mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        # Spectral contrast (computed for future use)
        _contrast = librosa.feature.spectral_contrast(y=y, sr=sr)

        # Acousticness: based on spectral features
        # Higher spectral centroid and rolloff usually indicate electric/produced sound
        centroid_norm = np.mean(spectral_centroid) / (sr / 2)
        features["acousticness"] = float(max(0, 1 - centroid_norm * 2))

        # Instrumentalness: based on vocal frequency presence
        # This is a rough approximation - vocals typically have energy in 300-3000 Hz
        spec = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        vocal_mask = (freqs >= 300) & (freqs <= 3000)
        vocal_energy = np.mean(spec[vocal_mask, :])
        total_energy = np.mean(spec)
        vocal_ratio = vocal_energy / (total_energy + 1e-6)
        features["instrumentalness"] = float(max(0, 1 - vocal_ratio))

        # Valence: rough approximation based on mode (major/minor)
        # Major keys tend to sound "happier"
        # Using tonnetz features for mode detection
        tonnetz = librosa.feature.tonnetz(y=y, sr=sr)
        # Positive tonnetz values in certain dimensions indicate major
        features["valence"] = float((np.mean(tonnetz[0]) + 1) / 2)

        # Speechiness: based on zero crossing rate and spectral flatness
        _flatness = librosa.feature.spectral_flatness(y=y)[0]  # For future use
        zcr_mean = np.mean(zcr)
        # Speech typically has high ZCR and moderate spectral flatness
        features["speechiness"] = float(min(1, zcr_mean * 2))

    except Exception as e:
        logger.error(f"Error extracting features from {file_path}: {e}")

    return features


def generate_fingerprint(file_path: Path) -> tuple[int, str] | None:
    """Generate AcoustID fingerprint for an audio file.

    Requires chromaprint/fpcalc to be installed on the system.
    Install via: brew install chromaprint (macOS) or apt install libchromaprint-tools (Linux)

    Args:
        file_path: Path to audio file

    Returns:
        Tuple of (duration_seconds, fingerprint_string) or None on error
    """
    try:
        duration, fingerprint = acoustid.fingerprint_file(str(file_path))
        return (duration, fingerprint)
    except acoustid.FingerprintGenerationError as e:
        logger.error(f"Error generating fingerprint for {file_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error generating fingerprint for {file_path}: {e}")
        return None


def lookup_acoustid(file_path: Path) -> dict | None:
    """Look up track metadata from AcoustID database.

    Requires ACOUSTID_API_KEY environment variable or app setting to be set.
    Get a free key at https://acoustid.org/new-application

    Args:
        file_path: Path to audio file

    Returns:
        Dict with metadata (title, artist, album, musicbrainz_id) or None
    """
    api_key = get_acoustid_api_key()
    if not api_key:
        logger.warning("ACOUSTID_API_KEY not set, skipping AcoustID lookup")
        return None

    try:
        results = acoustid.match(
            api_key,
            str(file_path),
            meta="recordings releases",
        )

        for score, recording_id, title, artist in results:
            if score > 0.8:  # High confidence match
                return {
                    "acoustid_score": score,
                    "musicbrainz_recording_id": recording_id,
                    "title": title,
                    "artist": artist,
                }

        return None

    except acoustid.NoBackendError:
        logger.error("chromaprint/fpcalc not found. Install chromaprint.")
        return None
    except acoustid.FingerprintGenerationError as e:
        logger.error(f"Error generating fingerprint: {e}")
        return None
    except acoustid.WebServiceError as e:
        logger.error(f"AcoustID API error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error in AcoustID lookup: {e}")
        return None


def identify_track(file_path: Path) -> dict:
    """Full track identification using AcoustID.

    Generates fingerprint and looks up metadata.

    Args:
        file_path: Path to audio file

    Returns:
        Dict with fingerprint and any matched metadata
    """
    result = {
        "fingerprint": None,
        "duration": None,
        "metadata": None,
    }

    # Generate fingerprint
    fp_result = generate_fingerprint(file_path)
    if fp_result:
        result["duration"], result["fingerprint"] = fp_result

    # Look up metadata if we have an API key
    if get_acoustid_api_key():
        metadata = lookup_acoustid(file_path)
        if metadata:
            result["metadata"] = metadata

    return result
