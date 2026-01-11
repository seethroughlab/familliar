# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha.17] - 2026-01-11

### Added

- **3D Explorer audio previews** - hover over artists to hear a preview
  - Crossfade transitions when moving between artists (300ms)
  - Representative track selection - uses track closest to artist's audio centroid instead of arbitrary first track
  - Toggle button to enable/disable audio previews
- **Proactive album art downloading** - artwork fetches in background when browsing
  - AlbumGrid, FullPlayer, and PlayerBar trigger background fetches
  - Fetches from Cover Art Archive, Last.fm, and Spotify (in order)
  - Rate-limited to avoid API bans
  - New endpoints: `POST /api/v1/artwork/queue`, `HEAD /api/v1/artwork/check/{artist}/{album}`

### Fixed

- **Broken image placeholders** - Music Map and 3D Explorer now show Music icon instead of broken image link when artwork is missing

## [0.1.0-alpha.16] - 2026-01-11

### Added

- **Ego-centric Music Map** - completely redesigned artist similarity visualization
  - Select any artist to center the map on them
  - 200 most similar artists radiate outward based on audio embeddings
  - Click any artist to recenter the map on them
  - Double-click to navigate to artist detail view
  - **Lasso selection** - drag to select multiple artists, then "Create Playlist" sends them to the LLM
  - **Figma-style controls** - drag to select, space+drag to pan, scroll to zoom
  - Deep zoom support (up to 15x)
  - Smooth animations when recentering
- **"Explore Similar Artists"** context menu item - right-click any track to open the Music Map centered on that artist

### Changed

- Music Map now uses ego-centric layout instead of UMAP projection (scales beyond 200 artists)

## [0.1.0-alpha.15] - 2026-01-09

### Added

- **Track metadata editing** - right-click any track and select "Edit Metadata..."
  - Tabbed modal with Basic, Extended, Sort, Lyrics, and Analysis tabs
  - Edit core fields: title, artist, album, album artist, track/disc number, year, genre
  - Edit extended fields: composer, conductor, lyricist, grouping, comment
  - Edit sort fields for proper alphabetization (e.g., "Beatles, The")
  - Edit embedded lyrics
  - Override detected BPM and key values
  - Option to write changes back to audio file tags (MP3, FLAC, M4A, OGG, AIFF)
- **Context menu everywhere** - full context menu now available on:
  - Player bar (currently playing track)
  - Full player overlay
  - Artist detail page
  - Favorites list
  - Playlist detail
  - All library browser views

### Changed

- Extended Track database model with new metadata fields
- Improved MusicBrainz release selection (prefers original albums over compilations)

## [0.1.0-alpha.13] - 2026-01-07

### Added

- **Auto-enrich metadata** when viewing artist detail page - triggers enrichment for all tracks

### Fixed

- **Artist detail URL persistence** - artist selection now stored in URL, survives page reload
- **YouTube video search** - add yt-dlp to Docker image (was missing, causing empty search results)

## [0.1.0-alpha.12] - 2026-01-06

### Fixed

- Simplify sync queue management to prevent stalls during feature extraction and embedding generation

## [0.1.0-alpha.11] - 2026-01-06

### Added

- **Artist images** in library browser with fallback chain (Last.fm → Spotify → album artwork)
- **Infinite scroll** for all library views (Artists, Albums, Tracks)
- **View persistence** - app remembers your selected library view

### Changed

- **Default library view** changed from Tracks to Artists
- **Artists view** redesigned as visual grid with artwork (matches Albums view)

### Fixed

- **Compilation album duplication** - Albums like "80's Wave" no longer appear multiple times
  - Sync now auto-detects compilation albums (multiple artists, no album_artist set)
  - Sets `album_artist = "Various Artists"` for tracks in detected compilations

## [0.1.0-alpha.10] - 2026-01-05

### Fixed

- Process pool crashing during analysis
- Tab selection now persists in URL hash across page reloads
- Removed redundant Audio Analysis progress bar from Library Statistics

### Changed

- Skip tracks shorter than 30 seconds or longer than 30 minutes during analysis
- Standardized spelling from "familliar" to "familiar" throughout codebase

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

[Unreleased]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.17...HEAD
[0.1.0-alpha.17]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.16...v0.1.0-alpha.17
[0.1.0-alpha.16]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.15...v0.1.0-alpha.16
[0.1.0-alpha.15]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.13...v0.1.0-alpha.15
[0.1.0-alpha.13]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.12...v0.1.0-alpha.13
[0.1.0-alpha.12]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.11...v0.1.0-alpha.12
[0.1.0-alpha.11]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.10...v0.1.0-alpha.11
[0.1.0-alpha.10]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.9...v0.1.0-alpha.10
[0.1.0-alpha.9]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.8...v0.1.0-alpha.9
[0.1.0-alpha.8]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.7...v0.1.0-alpha.8
[0.1.0-alpha.7]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.6...v0.1.0-alpha.7
[0.1.0-alpha.6]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.5...v0.1.0-alpha.6
[0.1.0-alpha.5]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.4...v0.1.0-alpha.5
[0.1.0-alpha.4]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.3...v0.1.0-alpha.4
[0.1.0-alpha.3]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/seethroughlab/familiar/releases/tag/v0.1.0-alpha.1
