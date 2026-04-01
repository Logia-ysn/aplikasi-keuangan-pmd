#!/bin/bash
# ============================================================================
# Setup Auto-Update — Keuangan ERP
#
# Konfigurasi cron job untuk auto-update dari GitHub.
#
# Usage:
#   bash scripts/setup-auto-update.sh              # Default: cek tiap 5 menit
#   bash scripts/setup-auto-update.sh 15            # Cek tiap 15 menit
#   bash scripts/setup-auto-update.sh disable       # Nonaktifkan auto-update
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UPDATE_SCRIPT="$SCRIPT_DIR/auto-update.sh"
LOG_FILE="$SCRIPT_DIR/auto-update.log"

# Make scripts executable
chmod +x "$UPDATE_SCRIPT"

if [ "$1" = "disable" ]; then
  # Remove existing cron entry
  crontab -l 2>/dev/null | grep -v "auto-update.sh" | crontab -
  echo "Auto-update dinonaktifkan."
  exit 0
fi

INTERVAL="${1:-5}"

# Validate interval
if ! echo "$INTERVAL" | grep -qE '^[0-9]+$'; then
  echo "Error: interval harus angka (menit). Contoh: bash $0 10"
  exit 1
fi

# Test update script first
echo "Testing update script..."
bash "$UPDATE_SCRIPT" --check
echo ""

# Remove existing finance-pmd cron entries
EXISTING_CRON=$(crontab -l 2>/dev/null | grep -v "auto-update.sh" || true)

# Add new cron entry
NEW_CRON="*/${INTERVAL} * * * * cd ${PROJECT_DIR} && bash ${UPDATE_SCRIPT} >> ${LOG_FILE} 2>&1"

echo "$EXISTING_CRON
$NEW_CRON" | crontab -

echo "╔══════════════════════════════════════════════════════╗"
echo "║          Auto-Update Berhasil Dikonfigurasi         ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Interval  : Setiap ${INTERVAL} menit                     "
echo "║  Script    : ${UPDATE_SCRIPT}"
echo "║  Log       : ${LOG_FILE}"
echo "║  Repo      : $(git remote get-url origin)"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Perintah:                                          ║"
echo "║  - Cek manual  : bash scripts/auto-update.sh        ║"
echo "║  - Force update: bash scripts/auto-update.sh --force ║"
echo "║  - Nonaktifkan : bash scripts/setup-auto-update.sh disable ║"
echo "║  - Lihat log   : tail -f scripts/auto-update.log    ║"
echo "╚══════════════════════════════════════════════════════╝"
