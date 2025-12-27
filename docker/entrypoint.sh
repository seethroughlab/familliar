#!/bin/bash
set -e

# Fix permissions for mounted volumes (runs as root initially)
chown -R familiar:familiar /app/data /data/art /data/videos 2>/dev/null || true

# Drop to familiar user and run the command
exec gosu familiar "$@"
