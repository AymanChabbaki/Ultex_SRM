#!/bin/bash
# Nightly Postgres backup -> gzip -> upload to off-server storage via rclone,
# with retention pruning both locally and on the remote. Runs once
# immediately on container start (so a fresh deploy is verified right away),
# then daily via cron -- see Dockerfile.
#
# This is UBOS's first backup mechanism -- none existed before. It's a
# separate safety net from the /api/db/sync purge fix (see server/src/
# index.js): that fix stops the routine save path from silently deleting
# records it doesn't recognize, but a real nightly dump is still needed for
# anything else that can lose data (an admin's explicit "Restaurer" of an
# old snapshot, a bad deploy, a mistaken bulk delete, disk failure, etc.).
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/tmp/backups"
FILENAME="ubos_pg_${TIMESTAMP}.sql.gz"
LOCAL_PATH="${BACKUP_DIR}/${FILENAME}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
REMOTE="${RCLONE_REMOTE:-gdrive:ultex-crm-backups}"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] Starting backup -> ${FILENAME}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dump \
  -h "${POSTGRES_HOST:-ubos-postgres}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner --no-privileges \
  | gzip > "$LOCAL_PATH"

echo "[$(date -Iseconds)] Dump complete ($(du -h "$LOCAL_PATH" | cut -f1)) -- uploading to ${REMOTE}"

rclone copy "$LOCAL_PATH" "$REMOTE" --config /root/.config/rclone/rclone.conf

echo "[$(date -Iseconds)] Upload complete -- pruning backups older than ${RETENTION_DAYS} days"

# Local prune (this container's own /tmp/backups scratch copy)
find "$BACKUP_DIR" -name "ubos_pg_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

# Remote prune (the actual off-server copies)
rclone delete "$REMOTE" --min-age "${RETENTION_DAYS}d" --config /root/.config/rclone/rclone.conf || true

echo "[$(date -Iseconds)] Backup cycle done."
