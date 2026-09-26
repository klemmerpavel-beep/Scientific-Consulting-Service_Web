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

# Недописанные файлы убираются при любом выходе: прежде при отказе на
# диске копились *.part, которые никто не удалял (решение Р-246).
trap 'rm -f "$TMP" "$DIR/backups/storage_$STAMP.tar.gz.part"' EXIT

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
  echo "$(date -Is) ОШИБКА: дамп меньше килобайта, копия не сохранена" >&2
  exit 1
fi
# Оборванный дамп — валидный gzip больше килобайта: соединение, порвавшееся
# посреди pg_dump, давало копию без половины таблиц, и ротация удаляла
# старые полные (решение Р-246). pg_dump пишет последней строкой отметку
# о завершении — без неё копия не принимается.
if ! gzip -dc "$TMP" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
  echo "$(date -Is) ОШИБКА: дамп оборван — нет отметки о завершении, копия не сохранена" >&2
  exit 1
fi

mv "$TMP" "$OUT"

# Материалы кабинета лежат файлами на диске, а не в базе: дамп их не
# содержит. Восстановление одной базы дало бы работающий кабинет с пустыми
# карточками — ссылки на версии есть, файлов нет. Каталог архивируется той же
# меткой времени, чтобы дамп и материалы восстанавливались парой.
FILES="$DIR/backups/storage_$STAMP.tar.gz"
# Метка .gitkeep за материалы не считается: она есть в репозитории всегда,
# и без этой оговорки архив снимался бы каждую ночь с пустого каталога.
CONTENT=$(ls -A "$DIR/storage" 2>/dev/null | grep -v '^\.gitkeep$' || true)
if [ -d "$DIR/storage" ] && [ -n "$CONTENT" ]; then
  tar -czf "$FILES.part" -C "$DIR" storage
  mv "$FILES.part" "$FILES"
  echo "$(date -Is) материалы кабинета: $(basename "$FILES"), $(wc -c < "$FILES") байт"
fi

# Старые копии удаляются только после того, как новая легла на диск.
find "$DIR/backups" -name 'prodisser_*.sql.gz' -mtime "+$KEEP_DAYS" -delete
find "$DIR/backups" -name 'storage_*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "$(date -Is) копия готова: $(basename "$OUT"), $SIZE байт до сжатия"
