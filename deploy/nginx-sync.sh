#!/bin/sh
# Приводит конфигурацию nginx на хосте к deploy/nginx.conf из репозитория.
# Вызывается из update.sh после успешного выката; можно запустить и руками:
#   sudo /opt/prodisser/deploy/nginx-sync.sh
#
# Прежде файл ставился один раз при первом развёртывании (DEPLOY.md, раздел 3)
# и дальше не обновлялся: правка в репозитории до сервера не доезжала, и
# предел тела запроса в 1 МБ отсекал загрузку файлов в кабинет (решение Р-231).
#
# Скрипт ничего не ломает молча: старая конфигурация сохраняется рядом,
# новая проверяется `nginx -t`, при отказе возвращается прежняя. Выкат
# приложения от исхода не зависит — код возврата всегда 0, итог в журнале.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$DIR/nginx.conf"
TARGET="${NGINX_SITE:-/etc/nginx/sites-available/prodisser}"

say() { echo "$(date -Is) nginx: $*"; }

if ! command -v nginx > /dev/null 2>&1; then
  say "nginx на хосте не найден, пропускаю"
  exit 0
fi
if [ ! -f "$TARGET" ]; then
  say "нет $TARGET — первичная установка по DEPLOY.md, раздел 3"
  exit 0
fi
if cmp -s "$SOURCE" "$TARGET"; then
  say "конфигурация совпадает с репозиторием"
  exit 0
fi
if [ ! -w "$TARGET" ]; then
  say "ВНИМАНИЕ: конфигурация отличается от репозитория, но прав на запись нет;"
  say "выполнить на сервере: sudo $DIR/nginx-sync.sh"
  exit 0
fi

BACKUP="$TARGET.before-sync"
cp -p "$TARGET" "$BACKUP"
cp "$SOURCE" "$TARGET"

# Вывод проверки запоминается до возврата прежнего файла: после возврата
# nginx -t говорит уже о прежней конфигурации, а не о причине отказа.
if CHECK=$(nginx -t 2>&1); then
  if nginx -s reload > /dev/null 2>&1; then
    say "конфигурация обновлена из репозитория, прежняя — $BACKUP"
  else
    say "ВНИМАНИЕ: конфигурация записана, но nginx не перечитал её"
  fi
else
  cp -p "$BACKUP" "$TARGET"
  say "ВНИМАНИЕ: новая конфигурация не прошла nginx -t, возвращена прежняя:"
  printf '%s\n' "$CHECK" | grep -v '\[warn\]' | sed 's/^/  /'
fi
exit 0
