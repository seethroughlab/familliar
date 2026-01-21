# Changelog

All notable changes to Familiar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-alpha.11] - 2026-01-21

### Added

- **Import quality comparison** - duplicate detection now compares audio quality
  - Shows whether incoming file is higher/lower/equal quality vs existing track
  - Quality factors: format tier (FLAC > AAC > MP3), bitrate, sample rate, bit depth
  - Visual indicators: green up-arrow (trumps existing), red down-arrow (trumped by), dash (equal)
  - One-click actions: "Replace" to upgrade, "Skip" to keep existing, "Import" for new tracks
  - New `quality.py` service with format tier definitions and comparison logic
- **AcoustID result caching** - API responses are now cached in the database
  - Avoids repeated API calls when identifying the same track multiple times
  - Cached per analysis version in `TrackAnalysis.acoustid_lookup`
  - Added `skip_cache` parameter to force fresh lookups when needed
- **Shuffle All for large libraries** - new lazy queue system fetches track metadata on demand
  - "Shuffle All" button in Tracks view shuffles entire library (or filtered results)
  - Server-side shuffle via `ORDER BY random()` for true randomization
  - Track metadata fetched just-in-time with prefetching for seamless playback
  - New API endpoints: `GET /tracks/ids` (lightweight) and `POST /tracks/batch`
- **get_similar_artists_in_library LLM tool** - find similar artists that exist in your library
  - Uses Last.fm for similarity data, checks against local library
  - Returns Bandcamp search URL when requested artist isn't in library
  - Updated system prompt with discovery suggestions workflow
- **README tools reference** - expandable "Available AI Tools (25)" section documenting all LLM capabilities

### Changed

- **Comprehensive mobile layout audit** - fixed 26 components for better mobile experience
  - **iOS auto-zoom prevention**: All text inputs now use `text-base` (16px) to prevent viewport zoom on focus
  - **Responsive grids**: Grid layouts now adapt column count on mobile (e.g., `grid-cols-2 sm:grid-cols-4`)
  - **Stacking layouts**: Horizontal button groups stack vertically on mobile
  - **Touch-friendly buttons**: Hover-only buttons now always visible on touch devices
  - **Reduced padding**: Full player, lyrics, modals use smaller padding on mobile
  - **Responsive dropdowns**: Pickers constrain width on small screens
  - Files updated: PlayerBar, FullPlayer, PlaylistDetail, ArtistDetail, AlbumDetail, TrackEditModal, ChatPanel, Settings panels, and more
- **Unified shuffle via global toggle** - Play buttons now respect the playbar's shuffle toggle
  - Removed separate "Shuffle" and "Shuffle All" buttons from ArtistDetail and TrackListBrowser
  - Play action checks global shuffle state and passes it to server for large track sets
  - Single source of truth: toggle shuffle in playbar, then click Play anywhere
  - `setQueue()` already respected shuffle toggle; now lazy queue mode does too
- **Unified Discovery Section** - consolidated discovery/recommendation UI into single component
  - All views (Playlist, Artist, Album, Full Player) now use identical discovery UI
  - Tab interface for switching between content types (Artists, Albums, Tracks)
  - Consistent styling with purple header icon and "via {sources}" metadata
  - Eliminated wrapper components (RecommendationsPanel, FullPlayer/DiscoverSection)
  - Data fetching moved to parent components for cleaner architecture
- **Improved album artwork fallbacks** - tracks and albums now use AlbumArtwork component with hash-based fallback
- **Filtered Last.fm placeholder images** - generic Last.fm placeholder URLs no longer shown, prefer our icons instead
- **URL state persistence** - playlist selection, visualizer type, and tab state now persist in URL
  - Playlist detail views survive page refresh
  - Visualizer type selection persists across navigation
  - Tab switching clears irrelevant URL params
- **Discovery section shows album names** for recommended tracks in library

### Fixed

- **Playlist detail overflow** - header now stacks vertically on mobile, preventing title/button clipping
- **Track skipping during queue changes** - fixed race condition where tracks could skip unexpectedly
  - Added transition tracking to ignore spurious "ended" events during queue/track loading
  - Prevents double-advancing when rapidly changing tracks

## [0.1.0-alpha.10] - 2026-01-15

### Added

- **Non-Places visualizer enhancements** - inspired by "Islands: Non-Places" game
  - New objects with glowing parts: vending machine, ATM, streetlight, exit sign
  - New palm tree silhouette with detailed fronds
  - Ground plane with parallax depth and subtle horizon line
  - Shadows beneath objects (darker/sharper for closer objects)
  - Gentle swaying animation on plant fronds
- **Rain Window visualizer** - new calm visualizer for ambient music
  - Rain droplets with physics-based trails sliding down glass
  - Soft bokeh lights in background using album artwork colors
  - Subtle bass reactivity for spawn rate and brightness

### Fixed

- **Visualizer stability** - fixed useEffect dependency bug causing objects to flicker/respawn every frame
  - Affected both Rain Window (bokeh lights) and Non-Places (silhouettes)
  - Root cause: `audioData` in dependency array caused effect to re-run on every frame
- **Plant frond rotation** - fronds now point upward correctly instead of sideways
  - Added -π/2 offset to canvas rotation so angle 0 means "up" not "right"
  - Affects both potted plant and palm tree shapes

### Changed

- **Non-Places object distribution** - weighted toward iconic glowing objects
  - Vending machines, ATMs, streetlights appear 2x as often
  - Palm trees appear 3x as often (good silhouette)
  - Removed abstract "ring" shape (didn't fit aesthetic)

## [0.1.0-alpha.9] - 2026-01-14

### Added

- **Semantic search** for natural language music queries
  - New `semantic_search` LLM tool uses CLAP text embeddings
  - Ask for "gloomy with Eastern influences" or "dreamy atmospheric synths" and find sonically matching tracks
  - Works by encoding your text description into the same embedding space as the audio
  - Gracefully falls back to metadata search when CLAP is disabled

## [0.1.0-alpha.8] - 2026-01-14

### Added

- **Album/artist name normalization** for consistent matching
  - Case-insensitive grouping: "Alice In Ultraland" and "Alice in Ultraland" now appear as one album
  - Handles diacritics (Björk = Bjork), quotes, dashes, and whitespace variations
  - Applied to album grouping, artwork hash computation, and compilation detection
- **Duplicate artist detection** LLM tools
  - `find_duplicate_artists` - detects artists with variant spellings (e.g., "Arovane_Phonem" vs "Arovane and Phonem")
  - `merge_duplicate_artists` - proposes merging duplicates via the review queue
- **Proposed Changes as main view** - now accessible from Library browser picker
  - Click the amber indicator to jump directly to the Proposed Changes view
  - Removed from Settings panel (now has its own dedicated view)
  - Improved card layout with more space for reviewing changes

### Changed

- **Artwork fetch order** - Last.fm checked first when API key is configured (faster than MusicBrainz)
- **Background Jobs indicator** now shows queue count (e.g., "5/10 (3 queued)")
- **Bulk change display** - shows unique values instead of raw JSON with track IDs
  - Before: `{"uuid1":"proem","uuid2":"Proem",...}`
  - After: `proem, Proem`

### Fixed

- Settings page crash caused by API responses not being arrays
- Proposed Changes API endpoint missing trailing slash

## [0.1.0-alpha.7] - 2026-01-14

### Added

- **Proposed Changes system** for metadata corrections
  - LLM can suggest metadata fixes that go to a review queue
  - New Settings panel to view, approve, reject, and apply proposed changes
  - Support for different scopes: database only, ID3 tags, or file organization
  - New LLM tools: `lookup_correct_metadata`, `propose_metadata_change`, `get_album_tracks`, `mark_album_as_compilation`, `propose_album_artwork`
  - MusicBrainz integration for looking up correct metadata
  - Cover Art Archive integration for album artwork
- **Proposed Changes indicator** in header bar
  - Amber badge shows count of pending changes
  - Click for quick preview popover
  - Links to full review interface in Settings

### Fixed

- Header popovers (Background Jobs, Proposed Changes, Health) now display above album art
  - Added proper z-index stacking: header z-30, PlayerBar z-20, popovers z-60

## [0.1.0-alpha.6] - 2026-01-11

### Added

- **Ego-centric Music Map** - completely redesigned artist similarity visualization
  - Select any artist to center the map on them
  - 200 most similar artists radiate outward based on audio embeddings
  - Click any artist to recenter the map on them
  - Double-click to navigate to artist detail view
  - **Lasso selection** - drag to select multiple artists, then "Create Playlist" sends them to the LLM
  - **Figma-style controls** - drag to select, space+drag to pan, scroll to zoom
  - Deep zoom support (up to 15x)
- **3D Explorer audio previews** - hover over artists to hear a preview
  - Crossfade transitions when moving between artists
  - Representative track selection - uses track closest to artist's audio centroid
  - Toggle button to enable/disable audio previews
  - Respects player volume slider in real-time
- **Proactive album art downloading** - artwork fetches in background when browsing
  - Fetches from Cover Art Archive, Last.fm, and Spotify (in order)
  - Rate-limited to avoid API bans
- **Background jobs status indicator** - see active background tasks in the header
  - Spinner icon appears when any background job is running
  - Click to see detailed progress for each job type
  - Tracks: Library Sync, Spotify Sync, New Releases Check, Artwork Fetch
- **"Explore Similar Artists"** context menu item - right-click any track to open the Music Map centered on that artist

### Changed

- Music Map now uses ego-centric layout instead of UMAP projection (scales beyond 200 artists)

### Fixed

- Broken image placeholders - Music Map and 3D Explorer now show Music icon instead of broken image link

## [0.1.0-alpha.5] - 2026-01-09

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
- **Auto-enrich metadata** when viewing artist detail page - triggers enrichment for all tracks

### Changed

- Extended Track database model with new metadata fields
- Improved MusicBrainz release selection (prefers original albums over compilations)

### Fixed

- Artist detail URL persistence - artist selection now stored in URL, survives page reload
- YouTube video search - add yt-dlp to Docker image (was missing, causing empty search results)

## [0.1.0-alpha.4] - 2026-01-06

### Added

- **Artist images** in library browser with fallback chain (Last.fm → Spotify → album artwork)
- **Infinite scroll** for all library views (Artists, Albums, Tracks)
- **View persistence** - app remembers your selected library view

### Changed

- **Default library view** changed from Tracks to Artists
- **Artists view** redesigned as visual grid with artwork (matches Albums view)
- Skip tracks shorter than 30 seconds or longer than 30 minutes during analysis

### Fixed

- **Compilation album duplication** - Albums like "80's Wave" no longer appear multiple times
  - Sync now auto-detects compilation albums (multiple artists, no album_artist set)
  - Sets `album_artist = "Various Artists"` for tracks in detected compilations
- Process pool crashing during analysis
- Tab selection now persists in URL hash across page reloads
- Simplify sync queue management to prevent stalls during feature extraction

## [0.1.0-alpha.3] - 2026-01-05

### Added

- **Split analysis into separate phases** for better memory efficiency
  - Phase 1: Feature extraction (librosa, artwork, AcoustID) - ~1-2GB memory
  - Phase 2: Embedding generation (CLAP model) - ~2-3GB memory
  - Each phase runs in its own subprocess that exits after completion
  - Peak memory reduced from ~5GB to ~3GB, works on 4GB containers
- **Updated sync UI** to show 4 phases: Discover → Read → Features → Embeddings
- **Environment variable** `DISABLE_CLAP_EMBEDDINGS=true` to skip embedding phase

### Fixed

- Library Sync progress bar now correctly shows progress during Features and Embeddings phases

## [0.1.0-alpha.2] - 2026-01-04

### Added

- Memory tracking in analysis subprocess for debugging OOM issues

### Fixed

- Rate-limited ProcessPoolExecutor recreation to prevent runaway process spawning
- Increased file descriptor limit to prevent EMFILE errors during bulk analysis
- Detect and clear stale sync locks on every sync attempt
- Install PyTorch after uv sync to prevent package removal during build
- Configure logging in analysis subprocess for better debugging
- Reduce uvicorn workers to 1 to prevent OOM during analysis

### Changed

- Add restart policies to postgres and redis containers in docker-compose
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

[Unreleased]: https://github.com/seethroughlab/familiar/compare/v0.1.0-alpha.11...HEAD
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
