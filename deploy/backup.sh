#!/bin/sh
# Резервная копия базы заявок. Ставится в cron на хосте:
#   0 3 * * * /opt/prodisser/deploy/backup.sh >> /var/log/prodisser-backup.log 2>&1
#
# Копии остаются на территории России вместе с базой — вывозить их
# в зарубежное хранилище нельзя, это та же обработка персональных данных.

set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
KEEP_DAYS=30
STAMP=$(date +%Y-%m-%d_%H%M)

docker compose --env-file "$DIR/.env" -f "$DIR/docker-compose.yml" exec -T db \
  pg_dump -U "${POSTGRES_USER:-prodisser}" "${POSTGRES_DB:-prodisser}" \
  | gzip > "$DIR/backups/prodisser_$STAMP.sql.gz"

find "$DIR/backups" -name 'prodisser_*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "$(date -Is) копия готова: prodisser_$STAMP.sql.gz"
