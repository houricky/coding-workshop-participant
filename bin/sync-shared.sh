#!/usr/bin/env bash
# Copy shared Python modules into each deployable backend service directory.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHARED_DIR="$PROJECT_ROOT/backend/_shared"

if [ ! -d "$SHARED_DIR" ]; then
    echo "Shared directory not found: $SHARED_DIR"
    exit 1
fi

shopt -s nullglob
for svc_dir in "$PROJECT_ROOT"/backend/*/; do
    svc_name="$(basename "$svc_dir")"
    if [[ "$svc_name" == _* ]]; then
        continue
    fi
    if [ ! -f "$svc_dir/function.py" ]; then
        continue
    fi
    for shared_file in "$SHARED_DIR"/*.py; do
        cp "$shared_file" "$svc_dir/"
    done
done
shopt -u nullglob

echo "Synced shared modules to backend services."
