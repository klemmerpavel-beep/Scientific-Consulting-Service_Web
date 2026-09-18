#!/bin/sh
# Обновление сайта до последней версии из ветки main. Запускается механизмом
# выката с GitHub по ssh, либо вручную на сервере:
#   /opt/prodisser/deploy/update.sh
#
# Порядок намеренно такой: копия базы, миграции, сборка, подъём, проверка
# здоровья. При отказе проверки возвращается прежний образ — сайт не остаётся
# лежать из-за неудачной правки.
#
# ВАЖНО про откат: возвращается код, но не схема базы. Миграции необратимы,
# поэтому они пишутся так, чтобы прежняя версия приложения продолжала
# работать с новой схемой (добавление колонки, а не переименование).

set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose --env-file $DIR/.env -f $DIR/docker-compose.yml"
HEALTH="http://127.0.0.1:3000/api/health"

say() { echo "$(date -Is) $*"; }

# Два выката разом гарантированно ломают друг друга: один пересобирает образ,
# другой поднимает контейнер на половине сборки. Блокировка отсекает второй.
LOCK="$DIR/.update.lock"
if command -v flock > /dev/null 2>&1; then
  exec 9> "$LOCK"
  if ! flock -n 9; then
    say "ОТКАЗ: обновление уже идёт"
    exit 1
  fi
fi

cd "$DIR/.."

BEFORE=$(git rev-parse --short HEAD)
git fetch --prune origin main
AFTER=$(git rev-parse --short FETCH_HEAD)

# Сверяется не то, что лежит в рабочей копии, а то, что реально доехало до
# работающего контейнера. Иначе выкат, упавший после `git reset` — например,
# на нехватке переменной окружения, — оставлял бы сервер с новым кодом и
# старым контейнером, а следующий запуск отвечал бы «обновление не требуется»
# и ничего не делал. Отметка ставится только после успешной проверки здоровья.
DEPLOYED=""
[ -f "$DIR/.deployed" ] && DEPLOYED=$(cat "$DIR/.deployed")

if [ "$BEFORE" = "$AFTER" ] && [ "$DEPLOYED" = "$AFTER" ]; then
  say "обновление не требуется: на сервере уже $BEFORE"
  exit 0
fi

if [ "$BEFORE" = "$AFTER" ] && [ "$DEPLOYED" != "$AFTER" ]; then
  say "код уже $AFTER, но до контейнера он не доехал — повторяю выкат"
fi

# На сервере правок не ведут (это записано в порядке работ), поэтому ветка
# приводится к состоянию удалённой целиком. Слияние здесь означало бы
# конфликт в три часа ночи и сайт, застрявший на середине обновления.
git reset --hard FETCH_HEAD
say "код обновлён: $BEFORE → $AFTER"

# Копия базы снимается до миграций: это единственная точка, откуда можно
# вернуться, если миграция окажется неудачной.
say "снимаю копию базы"
"$DIR/backup.sh"

# Прежний образ запоминается до сборки: к нему возвращаемся при отказе.
CONTAINER=$($COMPOSE ps -q web 2>/dev/null | head -n 1)
PREV_IMAGE=""
IMAGE_TAG=""
if [ -n "$CONTAINER" ]; then
  PREV_IMAGE=$(docker inspect --format '{{.Image}}' "$CONTAINER")
  IMAGE_TAG=$(docker inspect --format '{{index .Config.Image}}' "$CONTAINER")
fi

say "накатываю миграции"
$COMPOSE --profile migrate run --rm migrate

say "собираю образ"
$COMPOSE build web

say "поднимаю приложение"
$COMPOSE up -d web

# Проверка здоровья с запасом: приложение поднимается несколько секунд, а
# первый запрос к базе идёт медленнее последующих.
ok=0
i=1
# Число попыток вынесено в окружение: при ручном прогоне ждать минуту незачем,
# а на медленной машине минуты может не хватить.
TRIES=${HEALTH_TRIES:-30}
while [ "$i" -le "$TRIES" ]; do
  if curl -fsS --noproxy '*' -m 5 "$HEALTH" | grep -q '"ok":true'; then
    ok=1
    break
  fi
  sleep 2
  i=$((i + 1))
done

if [ "$ok" -eq 1 ]; then
  printf '%s\n' "$AFTER" > "$DIR/.deployed"
  say "готово: версия $AFTER отвечает"
  exit 0
fi

say "ОШИБКА: приложение не ответило за $((TRIES * 2)) секунд"

if [ -n "$PREV_IMAGE" ] && [ -n "$IMAGE_TAG" ]; then
  say "возвращаю прежний образ"
  docker tag "$PREV_IMAGE" "$IMAGE_TAG"
  $COMPOSE up -d --no-build web
  git reset --hard "$BEFORE"
  printf '%s\n' "$BEFORE" > "$DIR/.deployed"
  say "откат выполнен: снова $BEFORE. Схема базы осталась новой — см. шапку скрипта"
else
  say "откатывать нечего: прежний образ не найден"
fi

exit 1
