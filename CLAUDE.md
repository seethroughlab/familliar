# Familiar

An LLM-powered local music player that combines library management with AI-powered discovery. Users describe what they want to listen to in natural language, and Claude creates playlists from a deeply-analyzed local music collection.

## Architecture

- **Backend**: Python FastAPI + PostgreSQL (pgvector) + Redis
- **Frontend**: React + TypeScript + Vite + Tailwind + Zustand
- **Analysis**: Audio embeddings and features extracted via librosa/torch
- **LLM**: Claude API with tool-use (Ollama fallback)

## Key Directories

```
backend/
├── app/
│   ├── api/routes/      # FastAPI endpoints
│   ├── db/models.py     # SQLAlchemy models
│   └── services/        # Business logic (llm.py, analysis.py, background.py, etc.)
frontend/
├── src/
│   ├── components/      # React components
│   ├── hooks/           # Custom hooks (useAudioEngine, etc.)
│   ├── stores/          # Zustand state stores
│   ├── services/        # API services
│   └── db/              # IndexedDB/Dexie storage
```

## Key Files

| Task | Files |
|------|-------|
| Database models | `backend/app/db/models.py` |
| API routes | `backend/app/api/routes/*.py` |
| Audio analysis | `backend/app/services/analysis.py` |
| LLM tools | `backend/app/services/llm.py` |
| Audio playback | `frontend/src/hooks/useAudioEngine.ts` |
| Player state | `frontend/src/stores/playerStore.ts` |
| IndexedDB | `frontend/src/db/index.ts` |
| Visualizers | `frontend/src/components/Visualizer/` |
| Full player | `frontend/src/components/FullPlayer/` |
| Settings | `frontend/src/components/Settings/` |

## Common Tasks

### Add a new audio feature
1. Add extraction logic to `analysis.py` in `extract_features()`
2. No schema change needed (features stored as JSONB)
3. Bump `ANALYSIS_VERSION` in `config.py` to re-analyze existing tracks

### Add a new LLM tool
1. Define tool schema in `MUSIC_PLAYER_TOOLS` list in `llm.py`
2. Implement handler in `ToolExecutor` class
3. Tools can query JSONB with PostgreSQL `->` operator

### Add a new API endpoint
1. Create route in `backend/app/api/routes/`
2. Register router in `main.py`
3. Use dependency injection from `deps.py` for DB/auth

### Add a new settings section
1. Add component in `frontend/src/components/Settings/`
2. Export from `Settings/index.tsx`
3. Add to settings tabs in main Settings component

## Configuration

Most settings are configured via the admin UI (Settings panel):
- **Music library paths** - Settings > Library Management
- **API keys** - Admin page (Anthropic, Spotify, Last.fm, AcoustID)
- **LLM provider** - Settings > AI Assistant

Settings are stored in `data/settings.json` and persist across restarts.

## Environment Variables

Only infrastructure settings require environment variables:

```bash
# Required (from docker-compose or shell)
DATABASE_URL=postgresql+asyncpg://familiar:familiar@localhost:5432/familiar
REDIS_URL=redis://localhost:6379/0

# Optional (for Docker volume mounting only - actual paths configured in UI)
MUSIC_LIBRARY_PATH=/data/music
```

## Running Locally

```bash
# Backend (from backend/)
DATABASE_URL="..." REDIS_URL="..." uv run uvicorn app.main:app --reload --port 4400

# Frontend (from frontend/)
npm run dev
```

## Code Conventions

- Backend uses async SQLAlchemy with `DbSession` dependency
- Frontend uses Zustand for global state, React Query for server state
- Profile-based multi-user (no traditional auth) - profile ID in header
- Audio features stored as JSONB for flexibility
- Embeddings stored in pgvector for similarity search

- When fixing a bug, ask yourself: can we add a test that could have caught this?
