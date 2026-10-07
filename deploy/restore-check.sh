#!/bin/sh
# Проверка восстановления резервной копии. Запускается вручную после первой
# ночной копии; раз в месяц его запускает cron — строку ставит выкат
# (cron-sync.sh, решение Р-267): первого числа в 04:15.
#
# Копия, которая не восстанавливается, — не копия. Файл на диске выглядит
# одинаково и когда дамп полон, и когда он снят с пустой базы или оборван;
# разница видна только при восстановлении. Проверка разворачивает копию во
# временную базу рядом с боевой, сверяет состав и удаляет временную базу.
#
# Боевая база не затрагивается: временная создаётся с собственным именем,
# совпадение с боевой проверяется до начала работы и прекращает её.

set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose --env-file $DIR/.env -f $DIR/docker-compose.yml"

FILE="${1:-}"
if [ -z "$FILE" ]; then
  # Последняя копия по имени: в имени стоит дата, сортировка по нему
  # надёжнее, чем по времени изменения файла.
  FILE=$(ls -1 "$DIR"/backups/prodisser_*.sql.gz 2>/dev/null | sort | tail -n 1 || true)
fi
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "$(date -Is) ОШИБКА: копия не найдена, проверять нечего" >&2
  exit 1
fi

# Целостность файла — до восстановления (решение Р-443). В /bin/sh нет
# pipefail: оборванный или испорченный после снятия архив мог распаковаться
# до границы двух команд, psql завершался успешно, и проверка подтверждала
# копию без части таблиц. Архив проверяется целиком, а конец дампа — по
# отметке pg_dump о завершении, как при снятии копии (backup.sh).
if ! gzip -t "$FILE" 2>/dev/null; then
  echo "$(date -Is) ОШИБКА: архив копии повреждён: $(basename "$FILE")" >&2
  exit 1
fi
if ! gzip -dc "$FILE" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
  echo "$(date -Is) ОШИБКА: дамп в копии оборван — нет отметки о завершении: $(basename "$FILE")" >&2
  exit 1
fi

# Архивы хранилища файлов читаются целиком: последний полный и последний
# разностный. Прежде их не проверял никто (решение Р-443).
for kind in full diff; do
  ARCHIVE=$(ls -1 "$DIR"/backups/storage_*_"$kind".tar.gz 2>/dev/null | sort | tail -n 1 || true)
  if [ -n "$ARCHIVE" ] && ! tar -tzf "$ARCHIVE" > /dev/null 2>&1; then
    echo "$(date -Is) ОШИБКА: архив хранилища не читается: $(basename "$ARCHIVE")" >&2
    exit 1
  fi
done

CHECK_DB="restorecheck_$(date +%Y%m%d_%H%M%S)"

# Запросы уходят в psql через ввод, а не параметром -c: через -c кавычки
# вокруг "Lead" теряются по дороге между тремя оболочками (решение Р-120).
# Имя временной базы передаётся переменной окружения контейнера по той же
# причине — подстановка в строку команды означала бы четвёртый уровень кавычек.
run_main() {
  $COMPOSE exec -T db \
    sh -c 'psql -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
$1
SQL
}

run_service() {
  $COMPOSE exec -T -e CHECK_DB="$CHECK_DB" db \
    sh -c 'psql -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres'
}

run_check() {
  $COMPOSE exec -T -e CHECK_DB="$CHECK_DB" db \
    sh -c 'psql -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$CHECK_DB"' <<SQL
$1
SQL
}

LIVE_DB=$($COMPOSE exec -T db sh -c 'printf %s "$POSTGRES_DB"' | tr -d '\r')
if [ "$CHECK_DB" = "$LIVE_DB" ]; then
  echo "$(date -Is) ОШИБКА: имя временной базы совпало с боевой, проверка прекращена" >&2
  exit 1
fi

cleanup() {
  # Временная база удаляется в любом случае, включая падение проверки:
  # иначе на сервере копятся базы с персональными данными. FORCE отцепляет
  # оставшиеся подключения — без него удаление ждало бы их вечно.
  echo "DROP DATABASE IF EXISTS \"$CHECK_DB\" WITH (FORCE);" | run_service > /dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "CREATE DATABASE \"$CHECK_DB\";" | run_service > /dev/null

# Дамп подаётся на ввод psql распакованным. Ошибки восстановления
# останавливают проверку: ON_ERROR_STOP превращает их в ненулевой код.
gzip -dc "$FILE" | $COMPOSE exec -T -e CHECK_DB="$CHECK_DB" db \
  sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$CHECK_DB"' > /dev/null

TABLES=$(run_check "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d '[:space:]')

# Наличие таблиц проверяется отдельным запросом к перечню, а не попыткой
# сосчитать в них строки: запрос к несуществующей таблице падает, и вместо
# внятного «в копии нет заявок» в журнал попадала бы ошибка синтаксиса.
NEEDED=$(run_check "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Lead', '_prisma_migrations');" | tr -d '[:space:]')
if [ "$NEEDED" != "2" ]; then
  echo "$(date -Is) ОШИБКА: в копии нет таблицы заявок или перечня миграций — дамп снят не с той базы либо оборван" >&2
  exit 1
fi

LEADS=$(run_check "SELECT count(*) FROM \"Lead\";" | tr -d '[:space:]')
MIGRATIONS=$(run_check "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" | tr -d '[:space:]')
LIVE_LEADS=$(run_main "SELECT count(*) FROM \"Lead\";" | tr -d '[:space:]')
LIVE_TABLES=$(run_main "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d '[:space:]')

for value in "$TABLES" "$LEADS" "$MIGRATIONS" "$LIVE_LEADS" "$LIVE_TABLES"; do
  case "$value" in
    ''|*[!0-9]*)
      echo "$(date -Is) ОШИБКА: база не ответила числом, копия не подтверждена" >&2
      exit 1
      ;;
  esac
done

if [ "$MIGRATIONS" -lt 1 ]; then
  echo "$(date -Is) ОШИБКА: в копии нет ни одной применённой миграции — копия неполная" >&2
  exit 1
fi

# Заявки в боевой базе прибывают между снятием копии и проверкой, поэтому
# сверяется не равенство, а то, что копия не отстала: меньше заявок, чем было
# на момент снятия, означало бы оборванный дамп.
if [ "$LEADS" -gt "$LIVE_LEADS" ]; then
  echo "$(date -Is) ВНИМАНИЕ: в копии заявок больше, чем в базе ($LEADS против $LIVE_LEADS) — проверьте, не удалялись ли записи" >&2
fi

# Таблиц в копии меньше, чем в базе, бывает законно — копия перед
# миграциями выката, — поэтому это предупреждение, а не отказ (Р-443).
if [ "$TABLES" -lt "$LIVE_TABLES" ]; then
  echo "$(date -Is) ВНИМАНИЕ: в копии таблиц меньше, чем в базе ($TABLES против $LIVE_TABLES) — копия снята до миграций или неполна" >&2
fi

echo "$(date -Is) копия восстановлена: $(basename "$FILE"), таблиц $TABLES, заявок $LEADS (в базе сейчас $LIVE_LEADS), миграций $MIGRATIONS"
