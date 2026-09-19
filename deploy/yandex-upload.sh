#!/bin/sh
# Выгрузка заявок и отзывов в таблицы на Яндекс Диске. Ставится в cron на хосте:
#   0 * * * * /opt/prodisser/deploy/yandex-upload.sh >> /var/log/prodisser-yandex.log 2>&1
#
# Таблица пополняется сама, смотреть её можно с телефона и с компьютера, не
# заходя на сервер. Файл перезаписывается целиком: это всегда полный список
# заявок, а не приращение — так проще и так не бывает пропусков.
#
# ПОЧЕМУ ЯНДЕКС, А НЕ GOOGLE. В заявке есть имя, контакт и тема работы —
# персональные данные. Выгрузка их в Google означала бы трансграничную
# передачу в страну, которой нет в перечне обеспечивающих адекватную защиту:
# отдельное согласие каждого заявителя, уведомление Роскомнадзора до начала
# передачи и новая редакция Политики. Серверы Яндекса — в России, передачи за
# границу нет (решение Р-155).
#
# ЧТО ТРЕБУЕТСЯ ДО ВКЛЮЧЕНИЯ. Хранилище — третье лицо, и обработка ему
# поручается по договору (ч. 3 ст. 6 152-ФЗ). Годится тариф для организаций,
# где такой договор есть; личный Диск для этого не подходит. Перечень
# поручений в Политике дополняется пунктом об облачном хранилище — до этого
# выгрузка остаётся выключенной, и скрипт молча ничего не делает.

set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose --env-file $DIR/.env -f $DIR/docker-compose.yml"
WEBDAV="https://webdav.yandex.ru"

say() { echo "$(date -Is) $*"; }

# Значения читаются построчно, а не через `. .env`: в файле есть строки с
# угловыми скобками (SMTP_FROM), которые оболочка приняла бы за
# перенаправление ввода. Кавычки по краям снимаются, возврат каретки убирается.
read_env() {
  sed -n "s/^$1=//p" "$DIR/.env" 2>/dev/null | head -n 1 | tr -d '\r' \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

USER=$(read_env YANDEX_DISK_USER)
PASS=$(read_env YANDEX_DISK_PASSWORD)
FOLDER=$(read_env YANDEX_DISK_FOLDER)
[ -n "$FOLDER" ] || FOLDER="ProDisser"

if [ -z "$USER" ] || [ -z "$PASS" ]; then
  say "выгрузка на Диск выключена: YANDEX_DISK_USER или YANDEX_DISK_PASSWORD не задан в deploy/.env"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

# Папка создаётся каждый раз: MKCOL по существующей отвечает 405, и это не
# ошибка. Молчаливое падение здесь означало бы выгрузку в никуда.
code=$(curl -s -o /dev/null -w '%{http_code}' -u "$USER:$PASS" -X MKCOL "$WEBDAV/$FOLDER" || echo 000)
case "$code" in
  201|405) ;;
  401) say "ОШИБКА: Яндекс не принял логин или пароль приложения"; exit 1 ;;
  *) say "ОШИБКА: не удалось обратиться к Диску, ответ $code"; exit 1 ;;
esac

upload() {
  script="$1"
  name="$2"
  label="$3"

  if ! $COMPOSE --profile tools run --rm -T tools "scripts/$script" --stdout > "$TMP/$name" 2>"$TMP/err"; then
    say "ОШИБКА: выгрузка «$label» не собралась: $(tail -n 1 "$TMP/err")"
    return 1
  fi

  rows=$(( $(wc -l < "$TMP/$name") - 1 ))
  if ! curl -fsS -u "$USER:$PASS" -T "$TMP/$name" "$WEBDAV/$FOLDER/$name" > /dev/null; then
    say "ОШИБКА: «$label» не загрузилась на Диск"
    return 1
  fi

  say "«$label» на Диске: строк $rows, файл $FOLDER/$name"
}

failed=0
upload export-leads.mjs zayavki.csv "Заявки" || failed=1
upload export-reviews.mjs otzyvy.csv "Отзывы" || failed=1

exit "$failed"
