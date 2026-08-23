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
OUT="$DIR/backups/prodisser_$STAMP.sql.gz"
TMP="$OUT.part"

mkdir -p "$DIR/backups"

# Имя пользователя и базы берутся из окружения контейнера, а не из окружения
# cron: в cron переменных из deploy/.env нет, и подстановка по умолчанию
# молча сняла бы копию не той базы, если в .env заданы другие значения.
#
# Дамп пишется во временный файл, а не сразу через конвейер в gzip: в /bin/sh
# нет pipefail, и при отказе pg_dump конвейер всё равно завершается успешно —
# на диске оставался бы пустой архив, а cron молчал бы об этом до первой
# попытки восстановления.
docker compose --env-file "$DIR/.env" -f "$DIR/docker-compose.yml" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$TMP"

# Проверяем, что архив читается целиком и не пуст: усечённый дамп внешне
# выглядит как обычный файл.
gzip -t "$TMP"
SIZE=$(gzip -dc "$TMP" | wc -c)
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$TMP"
  echo "$(date -Is) ОШИБКА: дамп меньше килобайта, копия не сохранена" >&2
  exit 1
fi

mv "$TMP" "$OUT"

# Старые копии удаляются только после того, как новая легла на диск.
find "$DIR/backups" -name 'prodisser_*.sql.gz' -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) копия готова: $(basename "$OUT"), $SIZE байт до сжатия"
