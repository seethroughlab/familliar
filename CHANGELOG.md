# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha.9] - 2026-01-05

### Fixed

- Library Sync progress bar now correctly shows progress during Features and Embeddings phases

## [0.1.0-alpha.8] - 2026-01-05

### Changed

- **Made Features and Embeddings first-class sync phases** instead of sub-phases
  - Cleaner API: `phase: "features"` and `phase: "embeddings"` instead of `sub_phase`
  - Simplified frontend phase tracking logic

## [0.1.0-alpha.7] - 2026-01-04

### Changed

- **Split analysis into separate phases** for better memory efficiency
  - Phase 1: Feature extraction (librosa, artwork, AcoustID) - ~1-2GB memory
  - Phase 2: Embedding generation (CLAP model) - ~2-3GB memory
  - Each phase runs in its own subprocess that exits after completion
  - Peak memory reduced from ~5GB to ~3GB, works on 4GB containers
- **Updated sync UI** to show 4 phases: Discover → Read → Features → Embeddings
- **Environment variable** `DISABLE_CLAP_EMBEDDINGS=true` now skips embedding phase entirely

## [0.1.0-alpha.6] - 2026-01-04

### Fixed

- Rate-limited ProcessPoolExecutor recreation to prevent runaway process spawning
- Increased file descriptor limit to prevent EMFILE errors during bulk analysis

## [0.1.0-alpha.5] - 2026-01-04

### Fixed

- Detect and clear stale sync locks on every sync attempt (not just container startup)
- Add restart policies to postgres and redis containers in docker-compose

### Changed

- Reliability improvements for production deployment

## [0.1.0-alpha.4] - 2026-01-04

### Fixed

- Install PyTorch after uv sync to prevent package removal during build
- Flush stdout after memory logs to preserve output on OOM

## [0.1.0-alpha.3] - 2026-01-04

### Fixed

- Configure logging in analysis subprocess for better debugging

## [0.1.0-alpha.2] - 2026-01-03

### Added

- Memory tracking in analysis subprocess for debugging OOM issues

### Fixed

- Reduce uvicorn workers to 1 to prevent OOM during analysis
- Library stats now correctly counts tracks at current ANALYSIS_VERSION

### Changed

- Disable Docker layer cache for more reliable builds
- More aggressive disk cleanup during Docker build

## [0.1.0-alpha.1] - 2026-01-03

First alpha release of Familiar - an LLM-powered local music player.

### Features

- **AI-powered music chat** using Claude API with tool use
  - Natural language playlist creation
  - Music discovery through conversation
- **Local music library scanning** with metadata extraction
- **Audio analysis** with librosa for BPM, key, energy, valence, and audio features
- **CLAP embeddings** for semantic music search (optional, can be disabled)
- **Library Browser Views**
  - Album Grid with cover art thumbnails
  - Artist List with artist detail pages and discography
  - Mood Grid organizing tracks by energy/valence
  - Music Map with clustered visualization of similar tracks
  - Timeline view browsing by release year
  - Track List with sortable columns
- **Multi-select & Context Menus** in library browser
  - Shift-click and Ctrl/Cmd-click for multi-selection
  - Selection toolbar for batch actions
  - Right-click context menu on tracks
- **Spotify integration** for syncing favorites and matching to local tracks
- **Last.fm scrobbling** support
- **Smart playlists** with rule-based track filtering
- **PWA support** with offline playback
- **Music video downloads** from YouTube
- **Multi-profile support** for household use
- **Visualizer API** for community-contributed visualizers
  - Full access to track metadata, audio features, real-time audio data, and timed lyrics
  - Hooks: `useArtworkPalette`, `useBeatSync`, `useLyricTiming`
  - Built-in visualizers: FrequencyBars, AlbumKaleidoscope, LyricStorm, LyricPulse, CosmicOrb, ColorFlow
- **Admin setup page** at `/admin` for API key and library configuration
- **Version display** in Settings UI

### Technical

- **Backend**: Python FastAPI with async SQLAlchemy
- **Frontend**: React + TypeScript + Vite + Tailwind + Zustand
- **Database**: PostgreSQL with pgvector for embeddings
- **Cache**: Redis for session state and task queues
- **In-process background tasks** using ProcessPoolExecutor with spawn context
  - Single worker to limit memory usage (CLAP model is ~1.5GB)
  - APScheduler for periodic tasks (library scans every 6 hours)
- Docker deployment with multi-service compose
- CPU-only PyTorch for smaller Docker images (~200MB vs ~5GB)
- E2E tests with Playwright

### Known Issues

- Audio analysis can be memory-intensive on systems with <8GB RAM
- MoodMap accuracy depends on proper key detection

[Unreleased]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.9...HEAD
[0.1.0-alpha.9]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.8...v0.1.0-alpha.9
[0.1.0-alpha.8]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.7...v0.1.0-alpha.8
[0.1.0-alpha.7]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.6...v0.1.0-alpha.7
[0.1.0-alpha.6]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.5...v0.1.0-alpha.6
[0.1.0-alpha.5]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.4...v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.3...v0.1.0-alpha.4
[0.1.0-alpha.3]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/seethroughlab/familiar/releases/tag/v0.1.0-alpha.1
