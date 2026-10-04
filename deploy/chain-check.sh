#!/bin/sh
# Состояние цепочки «сайт → база → кабинет → Диск → кабинет» одним отчётом.
# Вызывается из update.sh в конце каждого выката — в том числе когда
# обновлять нечего, — поэтому отчёт виден в журнале выката на GitHub:
# кнопка «Run workflow» на странице «Выкат на боевой сервер» даёт его в
# любой момент. Руками на сервере:
#   /opt/prodisser/deploy/chain-check.sh
#
# Прежде о том, какие звенья включены на сервере, можно было узнать только
# зайдя на него: заявки принимались, а уведомление о них молча не уходило;
# доступ к Диску был вписан, а пароль приложения отозван — и снаружи это
# выглядело одинаково исправным (решение Р-263).
#
# В отчёт не попадает ничего, что стоит прятать: ни паролей, ни адресов, ни
# содержания заявок, ни коммерческих величин — число заявок и учётных
# записей тоже не печатается. Репозиторий открытый, и журнал выката виден
# любому: в нём только «задано / не задано», отказы и время прогонов.
#
# Каждая строка — одно звено: [ок] работает, [—] не включено (это состояние,
# а не сбой), [!] сломано. Строки [!] дублируются предупреждением GitHub и
# поднимаются в сводку выката. Выкат от исхода не зависит: код возврата
# всегда 0.
#
# Для проверки на стенде без docker: CHAIN_PSQL — команда psql, читающая
# запрос со стандартного ввода; CHAIN_HEALTH — адрес проверки здоровья.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose --env-file $DIR/.env -f $DIR/docker-compose.yml"
HEALTH="${CHAIN_HEALTH:-http://127.0.0.1:3000/api/health}"

read_env() {
  sed -n "s/^$1=//p" "$DIR/.env" 2>/dev/null | head -n 1 | tr -d '\r' \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

ok()   { echo "  [ок] $*"; }
off()  { echo "  [—]  $*"; }
bad()  { echo "  [!]  $*"; echo "::warning title=Цепочка::$*"; }

# Запрос к базе: одна строка результата, поля через «|». Отказ базы — пустая
# строка, и звено, которому нужны данные, пишет «нет данных», а не падает.
sql() {
  if [ -n "${CHAIN_PSQL:-}" ]; then
    printf '%s\n' "$1" | $CHAIN_PSQL 2>/dev/null | head -n 1
  else
    printf '%s\n' "$1" | $COMPOSE exec -T db \
      sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq -F "|" -v ON_ERROR_STOP=1' \
      2>/dev/null | head -n 1
  fi
}

# Время в базе — UTC без пояса (Prisma); в отчёте — московское.
MSK="AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Moscow'"
NOW="(now() AT TIME ZONE 'UTC')"
when() { echo "to_char(max($1) $MSK, 'DD.MM HH24:MI')"; }

# Путь для WebDAV: каждый сегмент кодируется, как encodeURIComponent в
# lib/disk/paths.ts, — иначе кириллица в имени книги дала бы 400, а не ответ.
urlencode() {
  printf '%s' "$1" | od -An -v -tx1 | tr -s ' \n' '\n\n' | sed '/^$/d' | while read -r h; do
    case "$h" in
      2d|2e|2f|5f|7e|3[0-9]|4[1-9a-f]|5[0-9a]|6[1-9a-f]|7[0-9a])
        # shellcheck disable=SC2059
        printf "\\$(printf '%03o' "0x$h")" ;;
      *) printf '%%%s' "$(printf '%s' "$h" | tr 'a-f' 'A-F')" ;;
    esac
  done
}

# Код ответа PROPFIND глубиной 0: 207 — есть, 404 — нет, 401 — не пустили.
# Логин и пароль идут curl через стандартный ввод, а не в строке вызова:
# строку вызова видит любой процесс на машине.
propfind() {
  user=$(read_env YANDEX_DISK_USER)
  pass=$(read_env YANDEX_DISK_PASSWORD)
  esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
  printf 'user = "%s:%s"\n' "$(esc "$user")" "$(esc "$pass")" \
    | curl -s -o /dev/null -w '%{http_code}' -m 20 -K - -X PROPFIND -H 'Depth: 0' "$1" 2>/dev/null \
    || echo 000
}

echo "$(date -Is) цепочка «сайт → база → кабинет → Диск → кабинет»:"

# ── 1. Приложение и база ────────────────────────────────────────────────────
health=$(curl -fsS --noproxy '*' -m 5 "$HEALTH" 2>/dev/null || true)
case "$health" in
  *'"ok":true'*) ok "сайт отвечает, база и схема в порядке" ;;
  *'"db":false'*) bad "сайт не видит базу" ;;
  *'"schema":false'*) bad "схема базы отстаёт от кода: миграции не накатились" ;;
  *) bad "сайт не отвечает на $HEALTH" ;;
esac

# ── 2. Приём заявок ─────────────────────────────────────────────────────────
# Только то, что таблица заявок читается: число и время заявок — сведения
# о делах практики, а журнал выката открыт всем.
if [ "$(sql 'SELECT count(*) FROM "Lead" WHERE false;')" = 0 ]; then
  ok "заявки: таблица заявок доступна"
else
  bad "заявки: база не ответила на запрос"
fi

# ── 3. Уведомление о заявке: Telegram и почта ───────────────────────────────
# Отказ «канал не настроен» пишется в журнал доставок при каждой заявке —
# это состояние, его показывает строка настройки, а не счётчик сбоев.
# Считаются отказы после последней удачной доставки: починенный канал не
# должен неделю числиться сломанным из-за отказа до починки (Р-275).
fails() {
  sql "SELECT count(*) FROM \"Delivery\" WHERE channel = '$1' AND NOT ok
       AND coalesce(error, '') <> 'канал не настроен'
       AND \"createdAt\" > $NOW - interval '7 days'
       AND \"createdAt\" > coalesce((SELECT max(\"createdAt\") FROM \"Delivery\"
                                     WHERE channel = '$1' AND ok), '-infinity');"
}
if [ -n "$(read_env TELEGRAM_BOT_TOKEN)" ] && [ -n "$(read_env TELEGRAM_CHAT_ID)" ]; then
  f=$(fails telegram)
  if [ "${f:-0}" -gt 0 ] 2>/dev/null; then bad "Telegram: отказов доставки после последней удачной — $f (кабинет → «Все заявки»)"
  else ok "Telegram: сигнал о заявке настроен"; fi
else
  off "Telegram: не настроен (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID; DEPLOY.md, 5е)"
fi
if [ -n "$(read_env SMTP_HOST)" ] && [ -n "$(read_env LEAD_MAIL_TO)" ]; then
  f=$(fails email)
  if [ "${f:-0}" -gt 0 ] 2>/dev/null; then bad "почта: отказов доставки заявок за 7 дней — $f"
  else ok "почта: письмо о заявке настроено"; fi
else
  off "почта: не настроена (SMTP_HOST, LEAD_MAIL_TO; DEPLOY.md, 5е)"
fi

# Выгрузка замечаний для исполнителя правок (Р-279). Ключ сверяется с тем,
# что видит работающий контейнер, — значение не печатается, только длина:
# ключ, дописанный в .env без перезапуска, до приложения не доходит.
key=$(read_env FEEDBACK_EXPORT_TOKEN)
seen=$($COMPOSE exec -T web sh -c 'printf %s "$FEEDBACK_EXPORT_TOKEN" | wc -c' 2>/dev/null | tr -d ' \r')
if [ "${#key}" -eq 0 ]; then
  off "замечания: выгрузка для правок выключена (FEEDBACK_EXPORT_TOKEN; DEPLOY.md, 5ж)"
elif [ "${#key}" -lt 32 ]; then
  bad "замечания: ключ выгрузки короче 32 знаков — адрес выключен (DEPLOY.md, 5ж)"
elif [ "${seen:-0}" != "${#key}" ]; then
  bad "замечания: ключ задан в .env, но приложение его не видит — перезапустите контейнер (DEPLOY.md, 5ж)"
else
  ok "замечания: выгрузка для правок включена"
fi

# ── 4. Кабинет: руководитель и рассылка уведомлений ─────────────────────────
heads=$(sql "SELECT count(*) FROM \"User\" WHERE role = 'HEAD' AND status = 'ACTIVE';")
if [ "${heads:-0}" -gt 0 ] 2>/dev/null; then ok "кабинет: учётная запись руководителя действует"
else bad "кабинет: нет действующей учётной записи руководителя (DEPLOY.md, 5в-бис, шаг 4)"; fi

# Справочник видов работ: без него одобрение заявки предлагает неполный
# выбор, а мост книги отклоняет строки (решение Р-267). Заводится миграцией.
kinds=$(sql "SELECT count(*) FROM \"ServiceType\" WHERE code IN ('dissertation','postgrad','consulting','research','article','diploma');")
if [ "${kinds:-0}" = 6 ]; then ok "кабинет: справочник видов работ полон"
else bad "кабинет: в справочнике видов работ ${kinds:-?} позиций из 6 — миграция 20260928120000_reference_catalog не легла"; fi

if [ -z "$(read_env CABINET_CRON_SECRET)" ]; then
  off "рассылка кабинета: не включена (CABINET_CRON_SECRET)"
else
  row=$(sql "SELECT count(*) FILTER (WHERE state = 'PENDING' AND \"scheduledAt\" < $NOW - interval '15 minutes'),
                    count(*) FILTER (WHERE state = 'FAILED' AND \"createdAt\" > $NOW - interval '7 days'),
                    $(when '"sentAt"')
             FROM \"NotificationOutbox\";")
  stuck=$(echo "$row" | cut -d'|' -f1); failed=$(echo "$row" | cut -d'|' -f2); sent=$(echo "$row" | cut -d'|' -f3)
  if [ "${stuck:-0}" -gt 0 ] 2>/dev/null; then
    bad "рассылка кабинета: $stuck уведомлений ждут дольше 15 минут — расписание не работает?"
  elif [ "${failed:-0}" -gt 0 ] 2>/dev/null; then
    bad "рассылка кабинета: отказов за 7 дней — $failed"
  else
    ok "рассылка кабинета: очередь пуста, последняя отправка — ${sent:-не было}"
  fi
fi

# ── 5. Зеркало на Яндекс Диске ──────────────────────────────────────────────
BASE=$(read_env YANDEX_DISK_WEBDAV); BASE=${BASE:-https://webdav.yandex.ru}; BASE=${BASE%/}
FOLDER=$(read_env YANDEX_DISK_FOLDER); FOLDER=${FOLDER:-ProDisser}
disk=0
if [ -z "$(read_env YANDEX_DISK_USER)" ] || [ -z "$(read_env YANDEX_DISK_PASSWORD)" ]; then
  off "Диск: доступ не задан (YANDEX_DISK_USER, YANDEX_DISK_PASSWORD; RELEASE.md, шаг 5а)"
else
  code=$(propfind "$BASE/")
  case "$code" in
    207) disk=1 ;;
    401|403) bad "Диск: Яндекс не принял логин или пароль приложения (код $code)" ;;
    *) bad "Диск: WebDAV не ответил как ожидалось (код $code)" ;;
  esac
  if [ "$disk" = 1 ]; then
    row=$(sql "SELECT $(when '"occurredAt"'), count(*) FILTER (WHERE \"occurredAt\" > $NOW - interval '2 hours')
               FROM \"AuditEvent\" WHERE action = 'DISK_SYNC';")
    last=$(echo "$row" | cut -d'|' -f1); fresh=$(echo "$row" | cut -d'|' -f2)
    lastfail=$(sql "SELECT payload->>'failed' FROM \"AuditEvent\" WHERE action = 'DISK_SYNC' ORDER BY \"occurredAt\" DESC LIMIT 1;")
    if [ -z "$last" ]; then
      ok "Диск: вход принят; выгрузок ещё не было — первая в ближайшее :00"
    elif [ "${fresh:-0}" = 0 ]; then
      bad "Диск: последняя выгрузка $last — больше двух часов назад (журнал: /var/log/prodisser-yandex.log)"
    elif [ "${lastfail:-0}" != 0 ]; then
      bad "Диск: последняя выгрузка $last прошла с ошибками: $lastfail"
    else
      ok "Диск: вход принят, последняя выгрузка $last"
    fi
  fi
fi

# ── 6. Книга заказов с Диска в кабинет ──────────────────────────────────────
BOOK=$(read_env BOOK_PULL_PATH)
if [ -z "$BOOK" ]; then
  off "книга заказов: мост выключен (BOOK_PULL_PATH), книга переносится экраном «Перенос книги»"
elif [ "$disk" != 1 ]; then
  off "книга заказов: ждёт доступа к Диску"
else
  code=$(propfind "$BASE/$(urlencode "$FOLDER")/$(urlencode "$BOOK")")
  if [ "$code" != 207 ]; then
    bad "книга заказов: файла «$BOOK» в папке «$FOLDER» на Диске нет (код $code)"
  else
    # Строки на разбор — по последнему переносу: неизменную книгу мост
    # пропускает по свёртке, и задержанная строка висит до исправления.
    row=$(sql "SELECT to_char(\"occurredAt\" $MSK, 'DD.MM HH24:MI'), payload->>'held',
                      extract(epoch FROM \"occurredAt\")::bigint
               FROM \"AuditEvent\" WHERE action = 'BOOK_PULL' ORDER BY \"occurredAt\" DESC LIMIT 1;")
    last=$(echo "$row" | cut -d'|' -f1); held=$(echo "$row" | cut -d'|' -f2)
    lastok=$(echo "$row" | cut -d'|' -f3)
    # Последний прогон моста — по журналу: упавший прогон в базу не пишет,
    # и отчёт показывал давний удачный перенос, пока мост падал каждый час
    # (решение Р-274). Первая ошибка прогона называет причину.
    BOOK_LOG=${CHAIN_BOOK_LOG:-/var/log/prodisser-book.log}
    # Журнал ведёт только прогон по расписанию; перенос, запущенный руками
    # после падения, пишется в базу — и снимает отметку, если он позже.
    tailrun=$(grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' "$BOOK_LOG" 2>/dev/null | tail -n 3)
    failat=$(date -u -d "$(echo "$tailrun" | tail -n 1 | cut -c1-19)" +%s 2>/dev/null || echo 0)
    if echo "$tailrun" | tail -n 1 | grep -q 'ОШИБКА' && [ "$failat" -gt "${lastok:-0}" ] 2>/dev/null; then
      ranat=$(echo "$tailrun" | tail -n 1 | cut -c1-16 | tr 'T' ' ')
      why=$(echo "$tailrun" | grep 'ОШИБКА' | head -n 1 | sed 's/^[^ ]* ОШИБКА: //' | cut -c1-240)
      bad "книга заказов: прогон моста $ranat UTC упал — $why (журнал: $BOOK_LOG)"
    elif [ "${held:-0}" -gt 0 ] 2>/dev/null; then
      bad "книга заказов: перенос $last оставил на разбор строк — $held (кабинет → «Перенос книги»)"
    else
      ok "книга заказов: файл на месте, последний перенос — ${last:-ещё не было, ближайший в :30}"
    fi
  fi
fi

# ── 7. Расписание и копии базы ──────────────────────────────────────────────
if command -v crontab > /dev/null 2>&1; then
  block=$(crontab -l 2>/dev/null | sed -n '/^# >>> prodisser/,/^# <<< prodisser/p' | grep -cE 'outbox|yandex-sync|book-pull' || true)
  if [ "$block" = 3 ]; then ok "расписание: рассылка, зеркало и мост стоят (cron-sync.sh)"
  elif [ "$(read_env CRON_SYNC)" = off ]; then off "расписание: ведётся руками (CRON_SYNC=off)"
  else bad "расписание: блока prodisser в crontab нет — cron-sync.sh не отработал"; fi
  if crontab -l 2>/dev/null | grep -qE '^[^#]*deploy/backup\.sh'; then
    ok "копии базы: ночная копия в расписании"
  else
    bad "копии базы: ночной копии в расписании нет (HOSTING.md, шаг 9)"
  fi
  # Срок хранения заявок — обязанность оператора персональных данных, а
  # проверка восстановления — единственное доказательство, что копия
  # годна. Обе ставит cron-sync.sh; прежде их ставили руками, и
  # отсутствие не было видно (Р-267).
  if crontab -l 2>/dev/null | grep -qE '^[^#]*deploy/retention\.sh'; then
    ok "срок хранения заявок: чистка в расписании"
  else
    bad "срок хранения заявок: retention.sh в расписании нет — его ставит cron-sync.sh (DEPLOY.md, раздел 4)"
  fi
  if crontab -l 2>/dev/null | grep -qE '^[^#]*deploy/restore-check\.sh'; then
    ok "копии базы: ежемесячная проверка восстановления в расписании"
  else
    bad "копии базы: проверки восстановления в расписании нет — её ставит cron-sync.sh (DEPLOY.md, раздел 4)"
  fi
fi
latest=$(ls -1 "$DIR"/backups/prodisser_*.sql.gz 2>/dev/null | sort | tail -n 1)
if [ -n "$latest" ]; then
  age=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
  if [ "$age" -gt 26 ]; then bad "копии базы: последней копии $age ч"
  else ok "копии базы: последней копии $age ч"; fi
fi

exit 0
