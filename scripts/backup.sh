#!/bin/bash
# ============================================
# Project Z - PostgreSQL Backup Script
# Run daily via cron: 0 2 * * * /path/to/backup.sh
# ============================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/projectz}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-projectz}"
POSTGRES_USER="${POSTGRES_USER:-projectz}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${POSTGRES_DB}_${DATE}.sql.gz"

# ── Create backup directory ────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── Perform backup ─────────────────────────────────────────
echo "[$(date)] Starting backup of ${POSTGRES_DB}..."

pg_dump \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=custom \
  --compress=9 \
  --verbose \
  2>/dev/null | gzip > "${BACKUP_FILE}"

# ── Verify backup ──────────────────────────────────────────
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
  BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "[$(date)] Backup completed: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
  echo "[$(date)] ERROR: Backup failed or is empty!"
  exit 1
fi

# ── Cleanup old backups ────────────────────────────────────
echo "[$(date)] Cleaning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "${POSTGRES_DB}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

# ── List current backups ───────────────────────────────────
echo "[$(date)] Current backups:"
ls -lh "${BACKUP_DIR}/${POSTGRES_DB}_"*.sql.gz 2>/dev/null | tail -5

echo "[$(date)] Backup process completed."
