#!/bin/bash
# ============================================================================
# Auto-Update Script — Keuangan ERP
#
# Cek GitHub untuk versi terbaru, pull, dan rebuild jika ada update.
#
# Usage:
#   bash scripts/auto-update.sh          # Cek & update jika ada
#   bash scripts/auto-update.sh --force  # Force rebuild tanpa cek
#   bash scripts/auto-update.sh --check  # Cek saja, jangan update
#
# Setup auto-update via cron (setiap 5 menit):
#   bash scripts/setup-auto-update.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-update.log"
LOCK_FILE="/tmp/finance-pmd-update.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "Update sudah berjalan (PID $LOCK_PID). Abaikan."
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

cd "$PROJECT_DIR"

MODE="${1:-auto}"

# ── Check for updates ──────────────────────────────────────────────────────
if [ "$MODE" != "--force" ]; then
  log "Checking for updates..."

  # Fetch latest from remote without merging
  git fetch origin main --quiet 2>/dev/null

  LOCAL_HASH=$(git rev-parse HEAD)
  REMOTE_HASH=$(git rev-parse origin/main)

  if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    log "Sudah versi terbaru ($LOCAL_HASH)."
    exit 0
  fi

  # Show what's new
  NEW_COMMITS=$(git log --oneline HEAD..origin/main)
  log "Update tersedia! Commit baru:"
  echo "$NEW_COMMITS" | tee -a "$LOG_FILE"

  if [ "$MODE" = "--check" ]; then
    log "Mode check-only. Jalankan tanpa --check untuk update."
    exit 0
  fi
fi

# ── Pull & Rebuild ─────────────────────────────────────────────────────────
log "Pulling latest changes..."
git pull origin main 2>&1 | tee -a "$LOG_FILE"

log "Rebuilding Docker containers..."
docker compose up -d --build 2>&1 | tee -a "$LOG_FILE"

# Wait for health check
log "Waiting for app to be healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=30
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  STATUS=$(docker compose ps --format json 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    d = json.loads(line)
    if d.get('Service') == 'app':
        print(d.get('Health', d.get('State', 'unknown')))
" 2>/dev/null || echo "unknown")

  if echo "$STATUS" | grep -qi "healthy"; then
    break
  fi
  ATTEMPTS=$((ATTEMPTS + 1))
  sleep 5
done

if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
  log "WARNING: App belum healthy setelah ${MAX_ATTEMPTS}x cek."
else
  NEW_VERSION=$(grep "APP_VERSION" client/src/lib/version.ts | head -1 | sed "s/.*'\(.*\)'.*/\1/")
  log "Update berhasil! Versi: v${NEW_VERSION}"
fi
