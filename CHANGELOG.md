# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-12-31

### Fixed
- **Docker health check URL** - Changed from `/health` to `/api/v1/health`
- **Worker health check** - Now uses `celery inspect ping` instead of HTTP (workers don't serve HTTP)
- **Subprocess isolation in Celery** - Switched from `multiprocessing` to `billiard` (Celery's fork that allows daemon processes to spawn children)
- **Health check timeouts** - Increased to 30s with 30s start period (prevents false unhealthy during heavy load)
- **API unresponsive under load** - Added 4 uvicorn workers (was single-threaded, causing health check timeouts)

### Added
- Test to verify Docker health check endpoint exists (`test_docker_health_check_endpoint`)
- Worker process recycling (`maxtasksperchild=10`) to prevent memory leaks

### Changed
- Feature extraction now runs in isolated subprocess to survive SIGSEGV crashes from corrupt audio files

## [0.1.1] - 2025-12-31

### Added
- **Admin setup page** at `/admin` for API key and library configuration
- Plex-style folder browser for library path selection
- "New Releases from Your Artists" feature
- Backend API test suite with 40+ tests
- Alembic migration tests
- ARM64 Docker image support (Synology NAS, Raspberry Pi)

### Changed
- Moved Library Paths and LLM settings to Admin interface (cleaner Settings panel)
- Python 3.11 in Docker image (better PyTorch wheel compatibility)
- Limit Celery worker concurrency to 4 (reduces memory usage)
- Renamed `alembic/` to `migrations/` to avoid package shadowing

### Fixed
- Database connection leak causing API slowdown over time
- Scanner progress reporting error (`ScanProgressReporter` attribute error)
- Tracks not appearing after scan (transaction timing issue)
- Torch import error when `DISABLE_CLAP_EMBEDDINGS=true`
- AcoustID fingerprint storage error (column too small)
- WorkerTask.started_at type error
- Celery health check for worker container
- Orphaned tracks cleanup when library paths are removed
- Playlists table schema migration

### Security
- Removed settings.json with API keys from git tracking

## [0.1.0] - 2025-12-30

### Added
- Initial public release
- **AI-powered music chat** using Claude API with tool use
- **Local music library scanning** with metadata extraction
- **Spotify integration** for syncing favorites and matching to local tracks
- **Last.fm scrobbling** support
- **Smart playlists** with rule-based track filtering
- **Audio analysis** with librosa for BPM, key, and audio features
- **CLAP embeddings** for semantic music search (optional, can be disabled)
- **PWA support** with offline playback and background sync
- **Listening sessions** for shared playback via WebRTC
- **Music video downloads** from YouTube
- **Multi-profile support** for household use
- Docker deployment with PostgreSQL (pgvector) and Redis
- OpenMediaVault installation guide

### Technical
- Auto-initialize database tables on first API startup
- CPU-only PyTorch for smaller Docker images (~200MB vs ~5GB)
- `DISABLE_CLAP_EMBEDDINGS` environment variable for systems where torch is problematic

[0.1.2]: https://github.com/seethroughlab/familliar/releases/tag/v0.1.2
[0.1.1]: https://github.com/seethroughlab/familliar/releases/tag/v0.1.1
[0.1.0]: https://github.com/seethroughlab/familliar/releases/tag/v0.1.0
