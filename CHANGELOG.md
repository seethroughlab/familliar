# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-30

### Added
- **ARM64 support** for Synology NAS and other ARM-based systems
- Comprehensive Synology NAS installation guide in README
- Multi-architecture Docker builds (amd64 + arm64)

### Fixed
- Scanner progress reporting error (`ScanProgressReporter` attribute error)

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

[0.2.0]: https://github.com/seethroughlab/familliar/releases/tag/v0.2.0
[0.1.0]: https://github.com/seethroughlab/familliar/releases/tag/v0.1.0
