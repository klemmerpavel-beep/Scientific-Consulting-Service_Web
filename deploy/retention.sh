#!/bin/sh
# Удаление заявок, у которых истёк срок хранения. Ставится в cron на хосте:
#   30 3 * * 1 /opt/prodisser/deploy/retention.sh >> /var/log/prodisser-retention.log 2>&1
#
# Политика обработки персональных данных, п. 7.1: данные заявителей хранятся
# до достижения цели обработки, но не более одного года с даты обращения,
# если договор не заключён. Обещание в тексте без исполнения в коде — это
# нарушение, которое видно проверяющему в первой же выгрузке из базы.
#
# Заявки со статусом CONTRACTED не трогаются: по ним договор заключён, и к ним
# применяется п. 7.2 (срок договора и три года после). Их удаление — отдельное
# действие с оглядкой на бухгалтерские сроки, автоматом такое не делается.
#
# Записи журнала доставок уходят вместе с заявкой: связь с ON DELETE CASCADE.

set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
KEEP_MONTHS=12

# Сначала считаем, потом удаляем: строка в журнале cron должна показывать,
# что именно произошло. Молчаливое удаление персональных данных проверить
# нельзя ни через год, ни через день.
SQL_COUNT="SELECT count(*) FROM \"Lead\" WHERE \"status\" <> 'CONTRACTED' AND \"createdAt\" < now() - interval '$KEEP_MONTHS months';"
SQL_DELETE="DELETE FROM \"Lead\" WHERE \"status\" <> 'CONTRACTED' AND \"createdAt\" < now() - interval '$KEEP_MONTHS months';"

run() {
  docker compose --env-file "$DIR/.env" -f "$DIR/docker-compose.yml" exec -T db \
    sh -c "psql -q -A -t -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"$1\""
}

DUE=$(run "$SQL_COUNT" | tr -d '[:space:]')

case "$DUE" in
  ''|*[!0-9]*)
    echo "$(date -Is) ОШИБКА: база не ответила числом, удаление не выполнялось" >&2
    exit 1
    ;;
esac

if [ "$DUE" -eq 0 ]; then
  echo "$(date -Is) срок хранения не истёк ни у одной заявки"
  exit 0
fi

run "$SQL_DELETE" > /dev/null
echo "$(date -Is) удалено заявок с истёкшим сроком хранения: $DUE"
