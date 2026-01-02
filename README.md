# Familiar

[![CI](https://github.com/seethroughlab/familliar/actions/workflows/ci.yml/badge.svg)](https://github.com/seethroughlab/familliar/actions/workflows/ci.yml)
[![Release](https://github.com/seethroughlab/familliar/actions/workflows/release.yml/badge.svg)](https://github.com/seethroughlab/familliar/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An LLM-powered local music player that combines library management with AI-powered discovery. Your music, your server, your data.

**Designed for home servers and NAS devices.** Familiar runs as a web service, making your music library accessible from any device on your network. The multi-profile support means everyone in your household gets their own favorites and listening history. While it can run on a personal computer, it really shines on always-on hardware like a Synology, QNAP, Unraid, or Raspberry Pi.

## Features

### AI-Powered Music Chat
Talk to your music library using Claude. Ask questions like:
- "Play something upbeat for a workout"
- "What albums do I have from the 90s?"
- "Find tracks similar to this one"
- "Create a playlist for a dinner party"

The AI understands your library's metadata, audio features (BPM, key, energy), and can create intelligent playlists on the fly.

### Local Library Management
- **Fast scanning** - Scans thousands of tracks quickly with metadata extraction
- **Audio analysis** - Automatic BPM, key detection, and audio feature extraction via librosa
- **CLAP embeddings** - Semantic audio search powered by LAION's CLAP model (optional)
- **AcoustID fingerprinting** - Identify unknown tracks
- **Multiple library paths** - Scan from multiple directories
- **Format support** - MP3, FLAC, AAC, OGG, WAV, AIFF, and more

### Spotify Integration
- Sync your Spotify favorites to your local library
- Automatic matching of Spotify tracks to local files
- See which favorites you're missing locally
- One-click sync to keep everything up to date

### Last.fm Scrobbling
- Automatic scrobbling as you listen
- Love/unlove tracks
- View your listening history

### Smart Playlists
Create dynamic playlists with rules:
- Filter by artist, album, genre, year
- Audio features: BPM range, key, energy level
- Recently added, most played, favorites
- Combine multiple rules with AND/OR logic

### Progressive Web App (PWA)
- Install on desktop or mobile
- Offline playback with cached tracks
- Background sync when connection returns
- Lock screen controls and media notifications
- Works over Tailscale HTTPS

### Music Videos
- Download music videos from YouTube
- Automatic matching to library tracks
- Toggle between audio and video playback

### Multi-Profile Support
- Multiple user profiles for household use
- Each profile has its own favorites and history
- Simple profile switching (no passwords)

### Audio Visualizers
Seven built-in visualizers with real-time audio reactivity:
- **Cosmic Orb** - GPU particle system with glowing orb and waveform ring
- **Frequency Bars** - Classic spectrum analyzer with 128 gradient bars
- **Album Kaleidoscope** - Shader-based kaleidoscope from album artwork
- **Color Flow** - Flowing particles using colors extracted from artwork
- **Lyric Storm** - 3D floating lyrics with depth and motion blur
- **Lyric Pulse** - Current lyrics with BPM-synced glow effects
- **Typography Wave** - Animated text waves

**[Create Your Own Visualizers](docs/VISUALIZER_API.md)** - Open API for community contributions with access to track metadata, audio features, real-time frequency data, and timed lyrics.

## Screenshots

<!-- Screenshots are auto-generated. Run `cd frontend && BASE_URL=http://localhost:5173 npm run screenshots` to update. -->

| Library Track List | Mood Grid |
|:--:|:--:|
| ![Library](screenshots/01-library-tracks.png) | ![Mood Grid](screenshots/02-library-mood-grid.png) |

| Music Map | Timeline |
|:--:|:--:|
| ![Music Map](screenshots/03-library-music-map.png) | ![Timeline](screenshots/04-library-timeline.png) |

| Playlists | Settings |
|:--:|:--:|
| ![Playlists](screenshots/05-playlists.png) | ![Settings](screenshots/07-settings.png) |

| Full Player | Visualizer |
|:--:|:--:|
| ![Full Player](screenshots/09-full-player.png) | ![Visualizer](screenshots/06-visualizer.png) |

| Admin Setup |
|:--:|
| ![Admin Setup](screenshots/11-admin-setup.png) |

### Mobile Interface

Familiar is fully responsive with a touch-friendly card layout on mobile devices.

| Library (Mobile) | Settings (Mobile) |
|:--:|:--:|
| ![Mobile Library](screenshots/12-mobile-library.png) | ![Mobile Settings](screenshots/13-mobile-settings.png) |

## Coming Soon

Features planned for future releases:

### Listening Sessions (WebRTC)
Share what you're listening to with friends in real-time. Host a session, share a link, and guests hear synchronized audio - no account required. Requires public signaling server deployment.

### Multi-Room Audio
Play to Sonos speakers and AirPlay devices in addition to browser audio. Control playback across multiple rooms with per-room volume controls.

### Additional LLM Providers
Support for more AI providers beyond Claude and Ollama, including OpenAI (ChatGPT), Google Gemini, and other compatible APIs.

### Library Browser Views
Pluggable library views for exploring your music in new ways:
- **Artist & Album views** - Browse by artist or album grid with artwork
- **Timeline** - Visualize your library by year, see when music was released
- **Mood Grid** - 2D scatter plot by energy and valence (happy/sad × calm/energetic)
- **Music Map** - Spatial visualization where similar-sounding artists appear close together (powered by CLAP embeddings)
- **Tempo Spectrum** - BPM distribution histogram for finding tracks at the right tempo

### Metadata Editing
Edit track metadata with changes written back to audio files:
- Single and bulk editing of ID3 tags
- Extended fields: composer, conductor, sort fields, lyrics
- Artwork upload and management
- MusicBrainz lookup for auto-populating metadata

## Documentation

- **[Visualizer API](docs/VISUALIZER_API.md)** - Create custom audio visualizers with full metadata access
- **[Library Browser API](docs/LIBRARY_BROWSERS.md)** - Create custom 2D/3D library visualizations
- **[REST API Reference](docs/REST-API.md)** - Backend REST API documentation

## Quick Start (Docker)

The easiest way to run Familiar is with Docker:

```bash
# Clone the repository
git clone https://github.com/seethroughlab/familliar.git
cd familliar/docker

# Copy and configure environment
cp .env.example .env
# Edit .env: set MUSIC_LIBRARY_PATH and FRONTEND_URL

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Initialize the database (first run only)
docker exec familiar-api python -m app.db.init_db
```

Access the web UI at http://localhost:4400, then go to `/admin` to configure API keys and start a library scan.

## Installation

### Docker (Recommended)

#### Prerequisites
- Docker Engine 24.0+
- Docker Compose v2.0+
- 2GB+ RAM available
- Music library accessible to Docker

#### Standard Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/seethroughlab/familliar.git
   cd familliar/docker
   ```

2. **Create environment file:**
   ```bash
   cp ../.env.example .env
   ```

   Edit `.env` and set:
   - `MUSIC_LIBRARY_PATH` - path to your music library
   - `FRONTEND_URL` - your server's URL (e.g., `http://myserver:4400`)

   > **Note:** `MUSIC_LIBRARY_PATH` is only used for the Docker volume mount. API keys are configured via the Admin UI at `/admin` after startup.

3. **Start the services:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

4. **Initialize database:**
   ```bash
   docker exec familiar-api python -m app.db.init_db
   ```

5. **Access the UI** at http://localhost:4400 and go to `/admin` to configure API keys.

### OpenMediaVault Installation

Familiar works great on OpenMediaVault NAS systems. Here's how to set it up:

#### Prerequisites
- OpenMediaVault 6.x or 7.x
- Docker plugin (omv-extras) installed
- Portainer or command-line access
- Shared folder with your music library

#### Step-by-Step Guide

1. **Enable Docker in OMV:**
   - Install `openmediavault-compose` plugin from omv-extras
   - Go to Services → Compose → Settings and enable it

2. **Create a shared folder for app data:**

   Create a folder called `familiar` on your data disk for app data (postgres, redis, settings).

   Your music library should already exist somewhere on your NAS.

3. **Create the compose file:**

   Go to Services → Compose → Files → Add:

   **Name:** `familiar`

   **File content:** (replace `/path/to` placeholders with your actual paths)
   ```yaml
   services:
     postgres:
       image: pgvector/pgvector:pg16
       container_name: familiar-postgres
       restart: unless-stopped
       environment:
         POSTGRES_USER: familiar
         POSTGRES_PASSWORD: familiar
         POSTGRES_DB: familiar
       volumes:
         - /path/to/familiar/postgres:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U familiar"]
         interval: 10s
         timeout: 5s
         retries: 5

     redis:
       image: redis:7-alpine
       container_name: familiar-redis
       restart: unless-stopped
       volumes:
         - /path/to/familiar/redis:/data
       healthcheck:
         test: ["CMD", "redis-cli", "ping"]
         interval: 10s
         timeout: 5s
         retries: 5

     api:
       image: ghcr.io/seethroughlab/familliar:latest
       container_name: familiar-api
       restart: unless-stopped
       ports:
         - "4400:8000"
       volumes:
         - /path/to/music:/data/music:ro
         - /path/to/familiar/data:/app/data
         - /path/to/familiar/art:/data/art
         - /path/to/familiar/videos:/data/videos
       environment:
         - DATABASE_URL=postgresql+asyncpg://familiar:familiar@postgres:5432/familiar
         - REDIS_URL=redis://redis:6379/0
         - FRONTEND_URL=http://your-omv-ip:4400
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_healthy
   ```

4. **Start the stack:**
   - Click the "Up" button in Compose → Files
   - Or via SSH: `docker compose -f /path/to/familiar.yml up -d`

5. **Initialize the database:**
   ```bash
   docker exec familiar-api python -m app.db.init_db
   ```

6. **Access Familiar:**
   - Open `http://your-omv-ip:4400` in a browser
   - Go to Settings to configure integrations

#### Optional: HTTPS Access via nginx Proxy

If you want to access Familiar over HTTPS using OMV's SSL certificate (recommended for Tailscale HTTPS):

1. Create a proxy configuration file:
   ```bash
   nano /etc/nginx/openmediavault-webgui.d/familliar.conf
   ```

2. Add this content:
   ```nginx
   location /familliar/ {
       proxy_pass http://127.0.0.1:4400/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

3. Reload nginx:
   ```bash
   nginx -t && systemctl reload nginx
   ```

4. Access Familiar at `https://your-omv-ip/familliar/`

#### Updating on OpenMediaVault

To update to a new version:

```bash
# Pull the latest image
docker pull ghcr.io/seethroughlab/familliar:latest

# Restart the containers
cd /path/to/familiar
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Or via OMV web UI:
# Compose → Files → Select familiar → Down → Pull → Up
```

#### Troubleshooting OMV Installation

**Permission issues with music files:**
```bash
# Check container can read music
docker exec familiar-api ls -la /data/music

# If permission denied, ensure OMV shared folder permissions allow Docker
```

**Database connection errors:**
```bash
# Check postgres is healthy
docker logs familiar-postgres

# Reset database if needed
docker exec familiar-api python -m app.db.init_db
```

**Background tasks not processing:**
```bash
# Check API logs (background tasks run in-process)
docker logs familiar-api

# Ensure Redis is running
docker exec familiar-redis redis-cli ping
```

**ARM64 audio analysis crashes (Raspberry Pi, ARM-based boards):**

If running on ARM64 hardware, add these environment variables to prevent analysis crashes:
```yaml
environment:
  - DISABLE_CLAP_EMBEDDINGS=true
  - OPENBLAS_NUM_THREADS=1
  - OMP_NUM_THREADS=1
```

### Synology NAS Installation

Familiar supports Synology NAS with Container Manager (DSM 7.2+) or Docker (older DSM).

#### Supported Models

**ARM64 models** (most common):
- DS218, DS220+, DS220j
- DS418, DS420+, DS420j
- DS720+, DS920+, DS923+
- RS820+, RS1221+

**x86 models** (Intel/AMD):
- DS920+, DS1621+, DS1821+
- DS3622xs+, RS3621xs+
- Any model with Intel Celeron, Atom, or Xeon

#### Step-by-Step Guide

1. **Install Container Manager:**
   - Open Package Center
   - Search for "Container Manager" (DSM 7.2+) or "Docker" (older DSM)
   - Install and open it

2. **Create folders for Familiar app data:**
   ```
   /volume1/docker/familiar/          # App data
   /volume1/docker/familiar/postgres  # Database
   /volume1/docker/familiar/redis     # Cache
   /volume1/docker/familiar/art       # Album artwork
   /volume1/docker/familiar/videos    # Music videos
   ```

   Your music library should already exist somewhere on your NAS (e.g., `/volume1/music/`).

3. **Create a Project in Container Manager:**
   - Go to Project → Create
   - **Project name:** `familiar`
   - **Path:** `/volume1/docker/familiar`
   - **Source:** Create docker-compose.yml

4. **Paste this docker-compose.yml:**
   ```yaml
   services:
     postgres:
       image: pgvector/pgvector:pg16
       container_name: familiar-postgres
       restart: unless-stopped
       environment:
         POSTGRES_USER: familiar
         POSTGRES_PASSWORD: familiar
         POSTGRES_DB: familiar
       volumes:
         - /volume1/docker/familiar/postgres:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U familiar"]
         interval: 10s
         timeout: 5s
         retries: 5

     redis:
       image: redis:7-alpine
       container_name: familiar-redis
       restart: unless-stopped
       volumes:
         - /volume1/docker/familiar/redis:/data
       healthcheck:
         test: ["CMD", "redis-cli", "ping"]
         interval: 10s
         timeout: 5s
         retries: 5

     api:
       image: ghcr.io/seethroughlab/familliar:latest
       container_name: familiar-api
       restart: unless-stopped
       ports:
         - "4400:8000"
       volumes:
         - /volume1/music:/data/music:ro
         - /volume1/docker/familiar/data:/app/data
         - /volume1/docker/familiar/art:/data/art
         - /volume1/docker/familiar/videos:/data/videos
       environment:
         - DATABASE_URL=postgresql+asyncpg://familiar:familiar@postgres:5432/familiar
         - REDIS_URL=redis://redis:6379/0
         - FRONTEND_URL=http://your-synology-ip:4400
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_healthy
   ```

   **Note:** Adjust `/volume1/music` to your music library and `FRONTEND_URL` to your Synology's IP.

5. **Build and start:**
   - Click "Build" to pull images and start containers
   - Wait for all containers to show as "Running"

6. **Access Familiar:**
   - Open `http://your-synology-ip:4400`
   - Go to Settings to configure API keys and start a library scan

#### Updating on Synology

1. Go to Container Manager → Project → familiar
2. Click "Action" → "Build" (this pulls latest images)
3. Containers will restart automatically

#### Troubleshooting Synology

**ARM64 audio analysis issues:**

Audio analysis may crash on ARM-based devices due to OpenBLAS/numpy threading issues. Add these environment variables to your api service:
```yaml
environment:
  - DISABLE_CLAP_EMBEDDINGS=true
  - OPENBLAS_NUM_THREADS=1
  - OMP_NUM_THREADS=1
```

This disables the heavy CLAP model and limits thread usage to prevent crashes. Basic audio analysis (BPM, key detection) will still work.

**Permission denied errors:**

Synology uses specific user/group IDs. If you see permission errors:
1. SSH into your Synology
2. Run: `sudo chown -R 1000:1000 /volume1/docker/familiar`

**Container won't start:**

Check logs in Container Manager → Container → familiar-api → Log

### Development Setup

For local development without Docker:

1. **Start infrastructure:**
   ```bash
   cd docker
   docker compose up -d  # Starts postgres and redis only
   ```

2. **Install backend:**
   ```bash
   cd backend
   uv sync --all-extras
   uv run python -m app.db.init_db
   ```

3. **Run API server:**
   ```bash
   make run
   ```

4. **Run worker (separate terminal):**
   ```bash
   make worker
   ```

5. **Run frontend (separate terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize for your deployment:

```bash
cp .env.example .env
# Edit .env with your settings
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `FRONTEND_URL` | Base URL for OAuth callbacks | `http://localhost:4400` |

**Important:** If accessing Familiar from a remote machine (not localhost), update `FRONTEND_URL` to use your server's hostname or IP address:
```
FRONTEND_URL=http://myserver:4400
```

All other settings (API keys, music library paths) are configured via the Admin UI at `/admin`.

### Getting API Keys

**Anthropic (Claude AI):**

The Anthropic API powers the AI chat feature, allowing you to ask questions about your music library and get intelligent recommendations.

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to **Settings** → **API Keys**
4. Click **Create Key** and give it a name (e.g., "Familiar")
5. Copy the key (starts with `sk-ant-...`)
6. Add it in Familiar's Admin UI at `/admin`

**Pricing note:** Anthropic charges per token. Typical music library queries cost fractions of a cent. See [anthropic.com/pricing](https://www.anthropic.com/pricing) for current rates.

**Spotify:**
1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Set redirect URI to `{FRONTEND_URL}/api/v1/spotify/callback` (e.g., `http://localhost:4400/api/v1/spotify/callback`)
4. Copy Client ID and Client Secret
5. Add them in Familiar's Admin UI at `/admin`

**Last.fm:**
1. Go to https://www.last.fm/api/account/create
2. Create a new application
3. Copy API Key and API Secret
4. Add them in Familiar's Admin UI at `/admin`

### Tailscale HTTPS

If you access Familiar over [Tailscale](https://tailscale.com/), you can enable HTTPS for full PWA support (install prompts, background sync, etc.).

1. **Enable HTTPS certificates** in your Tailscale admin console:
   - Go to [DNS settings](https://login.tailscale.com/admin/dns)
   - Enable "HTTPS Certificates"

2. **Use `tailscale serve`** on your server (easiest method):
   ```bash
   # Proxy HTTPS to Familiar on port 4400
   tailscale serve --bg https / http://localhost:4400
   ```

3. **Access via HTTPS:**
   ```
   https://your-server.<tailnet-name>.ts.net
   ```

This automatically provisions a Let's Encrypt certificate and handles renewal.

**Alternative: Manual certificates**

If you need cert files for nginx/caddy:
```bash
tailscale cert your-server.<tailnet-name>.ts.net
```

This creates `.crt` and `.key` files (you're responsible for renewal every 90 days).

See [Tailscale HTTPS docs](https://tailscale.com/kb/1153/enabling-https) for more details.

## Project Structure

```
familiar/
├── backend/          # Python FastAPI backend
│   ├── app/
│   │   ├── api/      # API routes
│   │   ├── db/       # Database models
│   │   ├── services/ # Business logic
│   │   └── workers/  # Background tasks
│   └── tests/
├── frontend/         # React + TypeScript PWA
│   ├── src/
│   │   ├── api/      # API client
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/ # Offline, sync services
│   │   └── stores/   # Zustand state
├── docker/           # Docker configuration
└── data/             # Runtime data (gitignored)
    ├── music/        # Music library mount
    ├── art/          # Extracted album art
    └── videos/       # Downloaded music videos
```

## Reporting Issues

Found a bug or have a feature request? Please open an issue:

**[GitHub Issues](https://github.com/seethroughlab/familliar/issues)**

When reporting bugs, please include:
- Your platform (OS, NAS model if applicable, Docker version)
- Steps to reproduce the issue
- Container logs: `docker logs familiar-api`
- Browser console errors (if frontend issue)

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.
