#!/usr/bin/env bash
set -euo pipefail

BASE_URL=${BASE_URL:-http://localhost:3001}
AUTH_HEADER=""
if [ -n "${TEST_JWT:-}" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer ${TEST_JWT}\""
fi

echo "Base URL: $BASE_URL"


# Discover services by looking for backend/*/function.py
mapfile -t func_files < <(find backend -maxdepth 2 -type f -name function.py 2>/dev/null || true)
if [ ${#func_files[@]} -eq 0 ]; then
  echo "No function.py files found under backend/* — cannot discover services. Exiting."
  exit 1
fi

declare -a routes
for f in "${func_files[@]}"; do
  dir=$(dirname "$f")
  svc=$(basename "$dir")
  base="/api/$svc"
  routes+=("$base")
  routes+=("$base/")
  # example UUID path to exercise single-item endpoints
  routes+=("$base/00000000-0000-0000-0000-000000000000")
done

# normalize and dedupe
declare -A seen
for r in "${routes[@]}"; do
  [[ "$r" == *"{"* || "$r" == *"<"* ]] && continue
  [[ "$r" != /* ]] && r="/$r"
  seen["$r"]=1
done

echo "Discovered routes:" >&2
for r in "${!seen[@]}"; do
  echo "$r"
done

echo
printf "%-60s %s\n" "Endpoint" "HTTP"
echo "$(printf '%.0s-' {1..75})"
for r in "${!seen[@]}"; do
  url="$BASE_URL$r"
  # use curl to get status
  if [ -n "${TEST_JWT:-}" ]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${TEST_JWT}" "$url" || echo "000")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
  fi
  printf "%-60s %s\n" "$r" "$status"
done
