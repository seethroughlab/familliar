#!/bin/bash
# Quick deploy to NAS for development testing
# Builds frontend locally and rsyncs to NAS, then restarts container
# Usage: ./scripts/deploy-dev.sh [--backend-only] [--frontend-only]
set -e

NAS_HOST="${NAS_HOST:-openmediavault}"
REMOTE_PATH="/opt/familiar"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# Parse arguments
DEPLOY_BACKEND=true
DEPLOY_FRONTEND=true

for arg in "$@"; do
    case $arg in
        --backend-only)
            DEPLOY_FRONTEND=false
            ;;
        --frontend-only)
            DEPLOY_BACKEND=false
            ;;
    esac
done

# Build frontend if needed
if [ "$DEPLOY_FRONTEND" = true ]; then
    echo "Building frontend..."
    cd frontend && npm run build && cd ..

    echo "Syncing frontend to $NAS_HOST..."
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        frontend/dist/ root@$NAS_HOST:$REMOTE_PATH/frontend/dist/

    echo "Copying frontend into container..."
    ssh root@$NAS_HOST "docker cp $REMOTE_PATH/frontend/dist/. familiar-api:/app/static/"
fi

# Sync backend if needed
if [ "$DEPLOY_BACKEND" = true ]; then
    echo "Syncing backend to $NAS_HOST..."
    rsync -avz \
        --exclude '__pycache__' \
        --exclude '.venv' \
        --exclude '*.pyc' \
        backend/app/ root@$NAS_HOST:$REMOTE_PATH/backend/app/
fi

echo "Restarting container..."
ssh root@$NAS_HOST "docker restart familiar-api"

echo ""
echo "Done! Changes deployed in ${SECONDS}s"
echo "View at: http://$NAS_HOST:4400"
