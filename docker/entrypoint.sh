#!/bin/bash
set -e

# Fix permissions for mounted volumes (runs as root initially)
chown -R familiar:familiar /app/data /data/art /data/videos 2>/dev/null || true

# Initialize database on first run (only for API container, not worker)
if [[ "$1" == "uvicorn"* ]] || [[ "$*" == *"uvicorn"* ]]; then
    echo "Checking database tables..."
    gosu familiar python -c "
import asyncio
from sqlalchemy import text
from app.db.session import engine
from app.db.models import Base

async def init_if_needed():
    async with engine.begin() as conn:
        # Check if profiles table exists
        result = await conn.execute(text(
            \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles')\"
        ))
        exists = result.scalar()

        if not exists:
            print('Initializing database tables...')
            await conn.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))
            await conn.run_sync(Base.metadata.create_all)
            print('Database initialized successfully.')
        else:
            print('Database tables already exist.')

asyncio.run(init_if_needed())
"
fi

# Drop to familiar user and run the command
exec gosu familiar "$@"
