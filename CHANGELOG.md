# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-02

### Added
- **Visualizer API** for community-contributed visualizers
  - Full access to track metadata, audio features, real-time audio data, and timed lyrics
  - New hooks: `useArtworkPalette`, `useBeatSync`, `useLyricTiming`
  - Template and documentation for creating custom visualizers
  - Community contribution directory
- **Enhanced visualizers** with advanced WebGL effects
  - GPU particle systems with instanced rendering
  - Post-processing effects (bloom, vignette) reactive to audio
  - Custom GLSL shaders for kaleidoscope, orb glow, and flow effects
  - BPM-synchronized animations

### Changed
- FrequencyBars visualizer: 64 → 128 bars with gradient colors and reflective floor
- AlbumKaleidoscope: Shader-based real-time mirroring with twist effects and sparkle particles
- LyricStorm: Converted to Three.js with 3D depth and motion
- LyricPulse: Now uses BPM sync for beat-aligned animations
- CosmicOrb: GPU particles (5000+) with curl noise motion and Fresnel glow
- ColorFlow: Flow field particles with palette extraction from artwork

### Documentation
- New [Visualizer API documentation](docs/VISUALIZER_API.md)
- Contributor guide for creating custom visualizers

## [0.1.0] - 2025-12-31

### Added
- **AI-powered music chat** using Claude API with tool use
- **Local music library scanning** with metadata extraction
- **Spotify integration** for syncing favorites and matching to local tracks
- **Last.fm scrobbling** support
- **Smart playlists** with rule-based track filtering
- **Audio analysis** with librosa for BPM, key, and audio features
- **CLAP embeddings** for semantic music search (optional, can be disabled)
- **PWA support** with offline playback and background sync
- **Music video downloads** from YouTube
- **Multi-profile support** for household use
- **Admin setup page** at `/admin` for API key and library configuration
- Per-section save buttons in Admin (no more scrolling to save)
- Library file organizer for renaming files based on metadata
- Plex-style folder browser for library path selection
- "New Releases from Your Artists" feature
- Backend API test suite with 40+ tests
- ARM64 Docker image support (Synology NAS, Raspberry Pi)
- Docker deployment with PostgreSQL (pgvector) and Redis

### Technical
- **In-process background tasks** using ProcessPoolExecutor with spawn context
  - Avoids fork/OpenBLAS SIGSEGV crashes that plague forked processes
  - APScheduler for periodic tasks (library scans every 6 hours)
  - No separate worker container needed
- Auto-initialize database tables on first API startup
- CPU-only PyTorch for smaller Docker images (~200MB vs ~5GB)
- `DISABLE_CLAP_EMBEDDINGS` environment variable for systems where torch is problematic
- 4 uvicorn workers for better handling of concurrent requests
- Library management moved to Admin page (cleaner Settings panel)

[0.2.0]: https://github.com/seethroughlab/familliar/releases/tag/v0.2.0
[0.1.0]: https://github.com/seethroughlab/familliar/releases/tag/v0.1.0
