#!/bin/sh
# Удаление заявок, у которых истёк срок хранения. В cron на хосте его ставит
# выкат (cron-sync.sh, решение Р-267): по понедельникам в 03:30.
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

# Файлы вложений удаляются до строк заявок. Удаление строки каскадом
# убирает и запись вложения, но объект в хранилище оставался навсегда — и
# каждую ночь уходил в резервную копию: персональные данные без владельца и
# без срока, вопреки тому же п. 7.1 (решение Р-246). Ключ вложения — путь
# внутри каталога хранилища; ключ с «..» или абсолютный не трогается.
SQL_KEYS="SELECT a.\"storageKey\" FROM \"LeadAttachment\" a JOIN \"Lead\" l ON l.id = a.\"leadId\" WHERE a.\"purgedAt\" IS NULL AND l.\"status\" <> 'CONTRACTED' AND l.\"createdAt\" < now() - interval '$KEEP_MONTHS months';"

# Без раннего выхода: прежде при нуле истёкших заявок скрипт завершался
# здесь, и чистка служебных строк кабинета ниже не выполнялась почти
# никогда (решение Р-246).
if [ "$DUE" -eq 0 ]; then
  echo "$(date -Is) срок хранения не истёк ни у одной заявки"
else
  FILES_REMOVED=0
  for KEY in $(run "$SQL_KEYS"); do
    case "$KEY" in
      /*|*..*) echo "$(date -Is) ВНИМАНИЕ: ключ вложения вне хранилища пропущен: $KEY" >&2; continue ;;
    esac
    if [ -f "$DIR/storage/$KEY" ]; then
      rm -f "$DIR/storage/$KEY"
      FILES_REMOVED=$((FILES_REMOVED + 1))
    fi
  done
  run "$SQL_DELETE" > /dev/null
  echo "$(date -Is) удалено заявок с истёкшим сроком хранения: $DUE, файлов вложений: $FILES_REMOVED"
fi

# ── Изъятые файлы: повтор удаления объектов ────────────────────────────────
#
# Версия материала и вложение заявки, изъятые при исполнении требования
# субъекта, помечены `purgedAt`, и ни экран, ни зеркало их не выдают. Объект
# удаляется до пометки, но отказ хранилища (каталог с чужим владельцем
# после ручного восстановления архива, Р-248) прежде только попадал в
# отчёт требования: строка помечалась изъятой, и повторить удаление было
# нечем — файл оставался в хранилище и в каждой ночной копии навсегда
# (проверка 09.10.2026). Здесь удаление повторяется для всех изъятых строк,
# чей объект ещё лежит в хранилище, — в том числе вернувшийся из архива
# хранилища после восстановления. Перенесённые в материалы вложения тоже
# помечены изъятыми: их исходный объект удаляется при переносе, а объект
# версии хранится под другим ключом и не затрагивается.
SQL_PURGED_KEYS="SELECT \"storageKey\" FROM \"MaterialVersion\" WHERE \"purgedAt\" IS NOT NULL UNION SELECT \"storageKey\" FROM \"LeadAttachment\" WHERE \"purgedAt\" IS NOT NULL;"

PURGED_REMOVED=0
PURGED_LEFT=0
for KEY in $(run "$SQL_PURGED_KEYS"); do
  case "$KEY" in
    /*|*..*) echo "$(date -Is) ВНИМАНИЕ: ключ изъятого файла вне хранилища пропущен: $KEY" >&2; continue ;;
  esac
  if [ -f "$DIR/storage/$KEY" ]; then
    if rm -f "$DIR/storage/$KEY" && [ ! -e "$DIR/storage/$KEY" ]; then
      PURGED_REMOVED=$((PURGED_REMOVED + 1))
    else
      PURGED_LEFT=$((PURGED_LEFT + 1))
      echo "$(date -Is) ОШИБКА: изъятый файл не удалён: $KEY" >&2
    fi
  fi
done
echo "$(date -Is) изъятые файлы: удалено оставшихся объектов: $PURGED_REMOVED, не удалось: $PURGED_LEFT"

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

# ── Очередь уведомлений: отработавшие строки ────────────────────────────────
#
# Строка очереди хранит тему и тело письма — с именем получателя и названием
# работы — и текст ошибки доставки. Нужна она, пока письмо в пути и пока
# руководитель разбирает отказ; потом это копия переписки без цели обработки
# (решение Р-252). Ушедшие хранятся 90 дней, неудавшиеся — 180: отказ
# разбирают дольше. Срок неудавшейся считается от последней попытки —
# повтор с экрана очереди возвращает строку в работу. Устаревшие до
# отправки и вошедшие в сводку куратора — тоже 90 дней от последнего
# движения: прежде они не удалялись вовсе и хранили темы и тела писем
# бессрочно (решение Р-440).
#
# Письма заявителям (ответ на отказ, Р-217) здесь не трогаются: по ним экран
# заявки показывает, дошёл ли ответ, и живут они сроком самой заявки —
# уходят каскадом вместе с ней в первом блоке скрипта.
SQL_OUTBOX_COUNT="SELECT count(*) FROM \"NotificationOutbox\" WHERE \"leadId\" IS NULL AND ((\"state\" = 'SENT' AND coalesce(\"sentAt\", \"createdAt\") < now() - interval '90 days') OR (\"state\" IN ('EXPIRED', 'MERGED') AND greatest(\"createdAt\", \"scheduledAt\") < now() - interval '90 days') OR (\"state\" = 'FAILED' AND greatest(\"createdAt\", \"scheduledAt\") < now() - interval '180 days'));"
SQL_OUTBOX="DELETE FROM \"NotificationOutbox\" WHERE \"leadId\" IS NULL AND ((\"state\" = 'SENT' AND coalesce(\"sentAt\", \"createdAt\") < now() - interval '90 days') OR (\"state\" IN ('EXPIRED', 'MERGED') AND greatest(\"createdAt\", \"scheduledAt\") < now() - interval '90 days') OR (\"state\" = 'FAILED' AND greatest(\"createdAt\", \"scheduledAt\") < now() - interval '180 days'));"

OUTBOX_DUE=$(run "$SQL_OUTBOX_COUNT" | tr -d '[:space:]')
run "$SQL_OUTBOX" > /dev/null
echo "$(date -Is) очередь уведомлений: удалено отработавших строк: ${OUTBOX_DUE:-?}"

# ── Книга заказов: брошенные загрузки ───────────────────────────────────────
#
# Загрузка книги хранит значения ячеек — ФИО заказчиков и темы работ. У
# зафиксированной они — след переноса и нужны сверке следующих загрузок.
# Незафиксированная (брошенный предпросмотр, прогон моста с --dry,
# оборвавшийся разбор) не нужна ни для чего: через 30 дней её строки
# удаляются вместе с ней, связь с ON DELETE CASCADE (решение Р-252).
# Зафиксированные не трогаются: в них же лежат надгробия строк, стёртых по
# требованию субъекта, — без них мост завёл бы стёртого клиента заново.
SQL_BATCHES_COUNT="SELECT count(*) FROM \"ImportBatch\" WHERE \"state\" <> 'APPLIED' AND \"createdAt\" < now() - interval '30 days';"
SQL_BATCHES="DELETE FROM \"ImportBatch\" WHERE \"state\" <> 'APPLIED' AND \"createdAt\" < now() - interval '30 days';"

BATCHES_DUE=$(run "$SQL_BATCHES_COUNT" | tr -d '[:space:]')
run "$SQL_BATCHES" > /dev/null
echo "$(date -Is) книга заказов: удалено брошенных загрузок старше 30 дней: ${BATCHES_DUE:-?}"
