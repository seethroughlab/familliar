# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/seethroughlab/familliar/compare/v0.1.0-alpha.1...HEAD
[0.1.0-alpha.1]: https://github.com/seethroughlab/familliar/releases/tag/v0.1.0-alpha.1
