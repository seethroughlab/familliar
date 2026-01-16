"""Community cache for sharing CLAP embeddings.

Allows Familiar users to share pre-computed CLAP embeddings, keyed by
AcoustID fingerprint hash. This dramatically speeds up analysis for
tracks that other users have already processed.

Privacy:
- Fingerprints are hashed (SHA256) before transmission - one-way, anonymous
- Only embeddings are shared, no track metadata or file information
- Contribution is opt-in

Versioning:
- Embeddings are versioned by ANALYSIS_VERSION and CLAP model version
- Prevents mixing embeddings from incompatible analysis pipelines
"""

import hashlib
import logging
from dataclasses import dataclass

import httpx
import numpy as np

from app.config import ANALYSIS_VERSION

logger = logging.getLogger(__name__)

# CLAP model identifier for versioning
CLAP_MODEL_VERSION = "laion/clap-htsat-unfused:v1"
EMBEDDING_DIM = 512

# Default community cache server
DEFAULT_CACHE_URL = "http://openmediavault:8000"


@dataclass
class CachedEmbedding:
    """A CLAP embedding retrieved from the community cache."""

    fingerprint_hash: str  # SHA256 hash of AcoustID fingerprint
    embedding: list[float]  # 512-dimensional CLAP embedding
    analysis_version: int
    clap_model_version: str
    contributor_count: int = 1  # How many users have contributed this embedding


class CommunityCacheService:
    """Client for the community CLAP embedding cache.

    Usage:
        cache = CommunityCacheService()

        # Check cache before computing locally
        cached = await cache.lookup(acoustid_fingerprint, ANALYSIS_VERSION)
        if cached:
            embedding = cached.embedding
        else:
            embedding = compute_clap_embedding(audio_file)
            await cache.contribute(acoustid_fingerprint, embedding, ANALYSIS_VERSION)
    """

    def __init__(
        self,
        cache_url: str = DEFAULT_CACHE_URL,
        timeout: float = 10.0,
    ):
        self.cache_url = cache_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None
        self._timeout = timeout

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self._timeout,
                headers={"User-Agent": "Familiar/0.1.0"},
            )
        return self._client

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def hash_fingerprint(acoustid_fingerprint: str) -> str:
        """Hash an AcoustID fingerprint for privacy.

        Uses SHA256 to create a one-way hash. The original fingerprint
        cannot be recovered, preserving user privacy while still
        allowing cache lookups.
        """
        return hashlib.sha256(acoustid_fingerprint.encode()).hexdigest()

    async def lookup(
        self,
        acoustid_fingerprint: str,
        analysis_version: int | None = None,
    ) -> CachedEmbedding | None:
        """Look up an embedding from the community cache.

        Args:
            acoustid_fingerprint: The raw AcoustID fingerprint string
            analysis_version: Version to match (defaults to current ANALYSIS_VERSION)

        Returns:
            CachedEmbedding if found, None otherwise
        """
        if analysis_version is None:
            analysis_version = ANALYSIS_VERSION

        fp_hash = self.hash_fingerprint(acoustid_fingerprint)

        try:
            client = await self._get_client()
            response = await client.get(
                f"{self.cache_url}/v1/embeddings/{fp_hash}",
                params={
                    "analysis_version": analysis_version,
                    "clap_model_version": CLAP_MODEL_VERSION,
                },
            )

            if response.status_code == 404:
                logger.debug(f"Community cache miss for {fp_hash[:16]}...")
                return None

            response.raise_for_status()
            data = response.json()

            # Validate embedding dimension
            embedding = data.get("embedding", [])
            if len(embedding) != EMBEDDING_DIM:
                logger.warning(
                    f"Invalid embedding dimension from cache: {len(embedding)} != {EMBEDDING_DIM}"
                )
                return None

            logger.info(
                f"Community cache hit for {fp_hash[:16]}... "
                f"(contributed by {data.get('contributor_count', 1)} users)"
            )

            return CachedEmbedding(
                fingerprint_hash=fp_hash,
                embedding=embedding,
                analysis_version=data.get("analysis_version", analysis_version),
                clap_model_version=data.get("clap_model_version", CLAP_MODEL_VERSION),
                contributor_count=data.get("contributor_count", 1),
            )

        except httpx.ConnectError:
            logger.debug("Community cache server unavailable")
            return None
        except httpx.HTTPStatusError as e:
            logger.warning(f"Community cache lookup error: {e}")
            return None
        except Exception as e:
            logger.warning(f"Community cache lookup failed: {e}")
            return None

    async def contribute(
        self,
        acoustid_fingerprint: str,
        embedding: list[float],
        analysis_version: int | None = None,
    ) -> bool:
        """Contribute an embedding to the community cache.

        Args:
            acoustid_fingerprint: The raw AcoustID fingerprint string
            embedding: 512-dimensional CLAP embedding
            analysis_version: Version of the analysis (defaults to current)

        Returns:
            True if contribution was accepted, False otherwise
        """
        if analysis_version is None:
            analysis_version = ANALYSIS_VERSION

        if len(embedding) != EMBEDDING_DIM:
            logger.warning(f"Cannot contribute embedding with wrong dimension: {len(embedding)}")
            return False

        fp_hash = self.hash_fingerprint(acoustid_fingerprint)

        try:
            client = await self._get_client()

            # Compress to float16 for smaller payload (~1KB vs 2KB)
            embedding_f16 = np.array(embedding, dtype=np.float16).tolist()

            response = await client.post(
                f"{self.cache_url}/v1/embeddings",
                json={
                    "fingerprint_hash": fp_hash,
                    "embedding": embedding_f16,
                    "analysis_version": analysis_version,
                    "clap_model_version": CLAP_MODEL_VERSION,
                },
            )

            if response.status_code == 201:
                logger.info(f"Contributed embedding to community cache: {fp_hash[:16]}...")
                return True
            elif response.status_code == 200:
                # Already exists, incremented contributor count
                logger.debug(f"Embedding already in cache, confirmed: {fp_hash[:16]}...")
                return True
            else:
                logger.warning(f"Community cache contribution rejected: {response.status_code}")
                return False

        except httpx.ConnectError:
            logger.debug("Community cache server unavailable for contribution")
            return False
        except Exception as e:
            logger.warning(f"Community cache contribution failed: {e}")
            return False

    async def health_check(self) -> dict:
        """Check if the community cache server is available.

        Returns:
            Dict with 'available' bool and optional 'stats' dict
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.cache_url}/health", timeout=5.0)

            if response.status_code == 200:
                data = response.json()
                return {
                    "available": True,
                    "stats": data.get("stats", {}),
                }

            return {"available": False, "error": f"HTTP {response.status_code}"}

        except Exception as e:
            return {"available": False, "error": str(e)}


# Singleton instance
_community_cache_service: CommunityCacheService | None = None


def get_community_cache_service(cache_url: str | None = None) -> CommunityCacheService:
    """Get or create the community cache service singleton.

    Args:
        cache_url: Optional custom cache URL. If provided and different
            from current, creates a new instance.
    """
    global _community_cache_service

    if _community_cache_service is None:
        _community_cache_service = CommunityCacheService(
            cache_url=cache_url or DEFAULT_CACHE_URL
        )
    elif cache_url and cache_url != _community_cache_service.cache_url:
        # URL changed, create new instance
        _community_cache_service = CommunityCacheService(cache_url=cache_url)

    return _community_cache_service
