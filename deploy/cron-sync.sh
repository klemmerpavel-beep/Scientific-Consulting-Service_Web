#!/bin/sh
# Приводит расписание связки «сайт → Диск → кабинет» на хосте к репозиторию.
# Вызывается из update.sh после успешного выката; можно запустить и руками:
#   /opt/prodisser/deploy/cron-sync.sh
#
# Прежде строки расписания вписывались руками по DEPLOY.md, и связка,
# готовая в коде, не включалась, пока кто-то не зайдёт на сервер с crontab -e
# (решение Р-262). Теперь расписание ставит выкат, а включает связку одно
# лишь заполнение deploy/.env: каждый из трёх скриптов при пустых доступах
# пишет «выключено» и выходит с нулём — стоять в расписании им безопасно.
#
# Скрипт ведёт в crontab один помеченный блок и больше ничего не трогает.
# Строки тех же скриптов вне блока (поставленные руками по прежней
# инструкции) удаляются, чтобы прогон не шёл дважды; вместе с ними уходит
# строка прежнего yandex-upload.sh — иначе в папке на Диске лежали бы две
# пары таблиц. Закомментированные строки и всё прочее расписание остаются
# как были. Копии баз, срок хранения заявок и проверка восстановления сюда
# не входят: это решения эксплуатации, и ставятся они по разделу 4.
#
# Отключить управление целиком: CRON_SYNC=off в deploy/.env — тогда скрипт
# не трогает расписание вовсе. Выкат от исхода не зависит: код возврата
# всегда 0, итог в журнале.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"

say() { echo "$(date -Is) расписание: $*"; }

read_env() {
  sed -n "s/^$1=//p" "$DIR/.env" 2>/dev/null | head -n 1 | tr -d '\r' \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

if [ "$(read_env CRON_SYNC)" = "off" ]; then
  say "управление выключено (CRON_SYNC=off), crontab не трогаю"
  exit 0
fi
if ! command -v crontab > /dev/null 2>&1; then
  say "crontab на хосте не найден, пропускаю"
  exit 0
fi

BEGIN="# >>> prodisser: связка сайт → Диск → кабинет (deploy/cron-sync.sh, не править)"
END="# <<< prodisser"

# Сдвиг на :30 у моста — чтобы два прогона не спорили за один служебный
# контейнер; рассылка уведомлений кабинета — раз в минуту (DEPLOY.md, 5в).
BLOCK="$BEGIN
* * * * * $DIR/outbox.sh >> /var/log/prodisser-outbox.log 2>&1
0 * * * * $DIR/yandex-sync.sh >> /var/log/prodisser-yandex.log 2>&1
30 * * * * $DIR/book-pull.sh >> /var/log/prodisser-book.log 2>&1
$END"

CURRENT=$(crontab -l 2>/dev/null || true)

# Всё, кроме нашего блока и действующих строк управляемых скриптов.
# Строка считается действующей, если не начинается с решётки. Пустые строки
# в конце подстановка $(…) срезает сама — от выката к выкату они не копятся.
OUTSIDE=$(printf '%s\n' "$CURRENT" | awk -v b="$BEGIN" -v e="$END" '
  $0 == b { skip = 1; next }
  $0 == e { skip = 0; next }
  !skip')
MANAGED='^[[:space:]]*[^#[:space:]].*deploy/(outbox|yandex-sync|yandex-upload|book-pull)\.sh'
DROPPED=$(printf '%s\n' "$OUTSIDE" | grep -cE "$MANAGED" || true)
REST=$(printf '%s\n' "$OUTSIDE" | grep -vE "$MANAGED" || true)

if [ -n "$REST" ]; then
  NEXT="$REST

$BLOCK"
else
  NEXT="$BLOCK"
fi

if [ "$NEXT" = "$CURRENT" ]; then
  say "совпадает с репозиторием"
  exit 0
fi

if printf '%s\n' "$NEXT" | crontab -; then
  if [ "$DROPPED" -gt 0 ]; then
    say "обновлено; убрано прежних строк вне блока: $DROPPED"
  else
    say "обновлено"
  fi
else
  say "ВНИМАНИЕ: crontab не принял новое расписание, прежнее осталось"
fi
exit 0
