# Familiar

An LLM-powered local music player that combines library management with AI-powered discovery.

## Development Setup

### Prerequisites

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- Docker and Docker Compose

### Quick Start

1. Start infrastructure services:
   ```bash
   cd docker
   docker compose up -d
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   make dev
   ```

3. Copy environment file and configure:
   ```bash
   cp .env.example .env
   # Edit .env with your music library path
   ```

4. Initialize database:
   ```bash
   cd backend
   make reset-db
   ```

5. Run the API:
   ```bash
   make run
   ```

6. In another terminal, run the worker:
   ```bash
   make worker
   ```

7. Access the API at http://localhost:8000

## Project Structure

```
familliar/
├── backend/          # Python FastAPI backend
│   ├── app/
│   │   ├── api/      # API routes
│   │   ├── db/       # Database models
│   │   ├── services/ # Business logic
│   │   └── workers/  # Celery tasks
│   └── tests/
├── frontend/         # React + TypeScript (Phase 2)
├── docker/           # Docker configuration
└── data/             # Runtime data (gitignored)
    ├── music/        # Music library mount
    ├── art/          # Extracted album art
    └── videos/       # Downloaded music videos
```

## Development

See `familiar-dev-plan.md` for the full development plan.
