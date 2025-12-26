# Familiar

[![CI](https://github.com/seethroughlab/familliar/actions/workflows/ci.yml/badge.svg)](https://github.com/seethroughlab/familliar/actions/workflows/ci.yml)
[![Release](https://github.com/seethroughlab/familliar/actions/workflows/release.yml/badge.svg)](https://github.com/seethroughlab/familliar/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An LLM-powered local music player that combines library management with AI-powered discovery.

## Features

- **Local Library Management** - Scan and organize your music collection
- **AI-Powered Chat** - Ask Claude about your music, get recommendations
- **Spotify Integration** - Sync favorites, match to local tracks
- **Last.fm Scrobbling** - Track your listening history
- **Smart Playlists** - Dynamic playlists based on rules and audio analysis
- **Listening Sessions** - Listen together with friends via WebRTC
- **PWA Support** - Offline playback, background sync
- **Music Videos** - Download and sync music videos from YouTube

## Quick Start (Docker)

The easiest way to run Familiar is with Docker:

```bash
# Clone the repository
git clone https://github.com/seethroughlab/familliar.git
cd familliar

# Copy and configure environment
cp .env.example .env
# Edit .env and set MUSIC_LIBRARY_PATH to your music folder

# Start all services
cd docker
docker compose -f docker-compose.prod.yml up -d

# Initialize the database (first run only)
docker exec familiar-api python -m app.db.init_db

# Scan your music library
docker exec familiar-api python -c "
from app.workers.tasks import scan_library
scan_library.delay()
"
```

Access the web UI at http://localhost:8000

## Installation

### Docker (Recommended)

#### Prerequisites
- Docker Engine 24.0+
- Docker Compose v2.0+
- 2GB+ RAM available
- Music library accessible to Docker

#### Standard Installation

1. **Pull the image:**
   ```bash
   docker pull ghcr.io/seethroughlab/familliar:latest
   ```

2. **Create a directory for Familiar:**
   ```bash
   mkdir -p ~/familiar && cd ~/familiar
   ```

3. **Download the compose file:**
   ```bash
   curl -O https://raw.githubusercontent.com/seethroughlab/familliar/master/docker/docker-compose.prod.yml
   curl -O https://raw.githubusercontent.com/seethroughlab/familliar/master/docker/init-pgvector.sql
   ```

4. **Create environment file:**
   ```bash
   cat > .env << 'EOF'
   # Required: Path to your music library
   MUSIC_LIBRARY_PATH=/path/to/your/music

   # Optional: API keys for integrations
   # ANTHROPIC_API_KEY=your-key-here
   # SPOTIFY_CLIENT_ID=your-id
   # SPOTIFY_CLIENT_SECRET=your-secret
   # LASTFM_API_KEY=your-key
   # LASTFM_API_SECRET=your-secret

   # Optional: Custom port (default: 8000)
   # API_PORT=8000

   # Optional: Database password (default: familiar)
   # POSTGRES_PASSWORD=secure-password
   EOF
   ```

5. **Start the services:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

6. **Initialize database and scan library:**
   ```bash
   docker exec familiar-api python -m app.db.init_db
   ```

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

2. **Create shared folders:**
   ```
   /srv/dev-disk-by-uuid-xxx/familiar/       # App data
   /srv/dev-disk-by-uuid-xxx/music/          # Your music library
   ```

3. **Create the compose file:**

   Go to Services → Compose → Files → Add:

   **Name:** `familiar`

   **File content:**
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
         - /srv/dev-disk-by-uuid-xxx/familiar/postgres:/var/lib/postgresql/data
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
         - /srv/dev-disk-by-uuid-xxx/familiar/redis:/data
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
         - "8000:8000"
       volumes:
         - /srv/dev-disk-by-uuid-xxx/music:/data/music:ro
         - /srv/dev-disk-by-uuid-xxx/familiar/art:/data/art
         - /srv/dev-disk-by-uuid-xxx/familiar/videos:/data/videos
       environment:
         - DATABASE_URL=postgresql+asyncpg://familiar:familiar@postgres:5432/familiar
         - REDIS_URL=redis://redis:6379/0
         - MUSIC_LIBRARY_PATH=/data/music
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_healthy

     worker:
       image: ghcr.io/seethroughlab/familliar:latest
       container_name: familiar-worker
       restart: unless-stopped
       command: celery -A app.workers.celery_app worker --loglevel=info
       volumes:
         - /srv/dev-disk-by-uuid-xxx/music:/data/music:ro
         - /srv/dev-disk-by-uuid-xxx/familiar/art:/data/art
         - /srv/dev-disk-by-uuid-xxx/familiar/videos:/data/videos
       environment:
         - DATABASE_URL=postgresql+asyncpg://familiar:familiar@postgres:5432/familiar
         - REDIS_URL=redis://redis:6379/0
         - MUSIC_LIBRARY_PATH=/data/music
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_healthy
   ```

   **Note:** Replace `/srv/dev-disk-by-uuid-xxx/` with your actual disk path.

4. **Start the stack:**
   - Click the "Up" button in Compose → Files
   - Or via SSH: `docker compose -f /path/to/familiar.yml up -d`

5. **Initialize the database:**
   ```bash
   docker exec familiar-api python -m app.db.init_db
   ```

6. **Access Familiar:**
   - Open `http://your-omv-ip:8000` in a browser
   - Go to Settings to configure integrations

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

**Worker not processing tasks:**
```bash
# Check worker logs
docker logs familiar-worker

# Ensure Redis is running
docker exec familiar-redis redis-cli ping
```

### Synology NAS Installation

Similar to OMV, but use Container Manager:

1. Download the compose file to your Synology
2. In Container Manager → Project → Create
3. Set the path and upload the compose file
4. Adjust volume paths for Synology format (`/volume1/music`, etc.)
5. Start the project

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

| Variable | Description | Default |
|----------|-------------|---------|
| `MUSIC_LIBRARY_PATH` | Path to music library | `/data/music` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+asyncpg://...` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `ANTHROPIC_API_KEY` | Claude API key for AI chat | - |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID | - |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret | - |
| `LASTFM_API_KEY` | Last.fm API key | - |
| `LASTFM_API_SECRET` | Last.fm API secret | - |
| `TURN_SERVER_URL` | TURN server for WebRTC | - |
| `TURN_SERVER_USERNAME` | TURN server username | - |
| `TURN_SERVER_CREDENTIAL` | TURN server password | - |

### Getting API Keys

**Anthropic (Claude AI):**

The Anthropic API powers the AI chat feature, allowing you to ask questions about your music library and get intelligent recommendations.

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in to your account
3. Navigate to **Settings** → **API Keys**
4. Click **Create Key** and give it a name (e.g., "Familiar")
5. Copy the key (starts with `sk-ant-...`)
6. Add to your `.env` file:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx...
   ```

**Pricing note:** Anthropic charges per token. Typical music library queries cost fractions of a cent. See [anthropic.com/pricing](https://www.anthropic.com/pricing) for current rates.

**Spotify:**
1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Set redirect URI to `http://localhost:8000/api/v1/spotify/callback`
4. Copy Client ID and Client Secret

**Last.fm:**
1. Go to https://www.last.fm/api/account/create
2. Create a new application
3. Copy API Key and API Secret

## Project Structure

```
familiar/
├── backend/          # Python FastAPI backend
│   ├── app/
│   │   ├── api/      # API routes
│   │   ├── db/       # Database models
│   │   ├── services/ # Business logic
│   │   └── workers/  # Celery tasks
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

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see [LICENSE](LICENSE) for details.
