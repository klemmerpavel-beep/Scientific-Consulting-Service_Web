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

# Запрос уходит в psql через ввод, а не параметром -c. Через -c он проходил
# три уровня кавычек — оболочка хоста, оболочка контейнера, psql, — и двойные
# кавычки вокруг "Lead" терялись по дороге. PostgreSQL приводил имя без кавычек
# к нижнему регистру и не находил таблицу: `relation "lead" does not exist`.
# Prisma создаёт таблицы с заглавной буквы, поэтому кавычки обязательны, а
# единственный надёжный способ их довезти — ввод (решение Р-120).
run() {
  docker compose --env-file "$DIR/.env" -f "$DIR/docker-compose.yml" exec -T db \
    sh -c 'psql -q -A -t -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
$1
SQL
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

# ── Кабинет: погашенные ссылки входа и отработавшие сессии ────────────────
#
# Ссылка входа живёт 15 минут, сессия — свой срок. Строки, переставшие
# что-либо открывать, хранить незачем: это идентификаторы пользователей
# без всякой цели обработки. Журналы действий и доступа к файлам здесь не
# трогаются — у них своя задача и свой срок.
SQL_TOKENS="DELETE FROM \"LoginToken\" WHERE \"expiresAt\" < now() - interval '30 days';"
SQL_SESSIONS="DELETE FROM \"Session\" WHERE \"expiresAt\" < now() - interval '90 days' OR (\"revokedAt\" IS NOT NULL AND \"revokedAt\" < now() - interval '90 days');"
SQL_ATTEMPTS="DELETE FROM \"LoginAttempt\" WHERE \"occurredAt\" < now() - interval '90 days';"

run "$SQL_TOKENS" > /dev/null
run "$SQL_SESSIONS" > /dev/null
run "$SQL_ATTEMPTS" > /dev/null
echo "$(date -Is) кабинет: погашенные ссылки, истёкшие сессии и попытки входа старше срока удалены"
