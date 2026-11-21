#!/usr/bin/env bash
# Полный прогон проверок рабочей копии перед слиянием и запросом:
# перенос макетов, типы, тесты без базы, тесты на PostgreSQL (своя свежая
# база), обе сборки; по ключу --site — ещё landing-audit на семи ширинах с
# axe-core и ui-checks на собранном сервере. Журналы — в каталог проверки,
# итог — таблица в конце; код выхода ненулевой, если упала хоть одна проверка.
#
#   bash .claude/skills/prodisser-orchestration/scripts/release-check.sh [каталог копии] [--site /,/main,...] [--port N]
#
# Порт сервера для --site — из блока копии (по умолчанию первый + 9).
set -uo pipefail

dir=$(cd "${1:-.}" && git rev-parse --show-toplevel)
shift || true
site=""; port=""
while [ $# -gt 0 ]; do
  case "$1" in
    --site) site=$2; shift 2;;
    --port) port=$2; shift 2;;
    *) echo "неизвестный ключ $1" >&2; exit 2;;
  esac
done
name=$(git -C "$dir" rev-parse --abbrev-ref HEAD)
db="${name//[^a-zA-Z0-9]/_}_check"
out=${CHECK_OUT:-/tmp/prodisser-checks/$(basename "$dir")-$(date +%H%M%S)}
mkdir -p "$out"
skill="$dir/.claude/skills/prodisser-visual-style/scripts"
secret=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
declare -a rows
fail=0

step() { # step <имя> <команда…>
  local label=$1; shift
  if (cd "$dir/app" && "$@") > "$out/$label.log" 2>&1; then rows+=("ok    $label"); else rows+=("FAIL  $label (журнал $out/$label.log)"); fail=1; fi
}
count() { grep -E "^# (pass|fail) " "$out/$1.log" 2>/dev/null | tr '\n' ' '; }

service postgresql status >/dev/null 2>&1 || service postgresql start >/dev/null 2>&1
step sync bash "$skill/sync-check.sh" --check
step typecheck npm run typecheck
step test env -u DATABASE_URL npm test
sudo -u postgres psql -qc "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" -c "CREATE DATABASE \"$db\" OWNER ci" >/dev/null 2>&1
step migrate env DATABASE_URL="postgresql://ci:ci@127.0.0.1:5432/$db" npx prisma migrate deploy
step db env DATABASE_URL="postgresql://ci:ci@127.0.0.1:5432/$db" SESSION_SECRET=$secret node --test --test-concurrency=1 "tests/**/*.db.test.ts"
sudo -u postgres psql -qc "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1
step build env DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci NEXT_PUBLIC_SITE_URL=https://prodisser.ru npm run build

if [ -n "$site" ]; then
  if [ -z "$port" ]; then
    reg="$(dirname "$(git -C "$dir" worktree list --porcelain | awk 'NR==1{print $2}')")/.wt-registry"
    p0=$(awk -v n="$name" '$1==n{print $2}' "$reg" 2>/dev/null)
    port=$(( ${p0:-3400} + 9 ))
  fi
  (cd "$dir/app" && PORT=$port HOSTNAME=127.0.0.1 DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci SESSION_SECRET=$secret \
    NEXT_PUBLIC_SITE_URL=https://prodisser.ru nohup node .next/standalone/server.js > "$out/server.log" 2>&1 & echo $! > "$out/server.pid")
  sleep 5
  if (cd "$out" && NODE_PATH=/opt/node22/lib/node_modules node "$skill/landing-audit.mjs" --base "http://127.0.0.1:$port" \
      --paths "$site" --widths 360,390,414,480,768,1024,1440 --axe /var/tmp/pwtest/node_modules/axe-core/axe.min.js --out "$out/audit") > "$out/audit.log" 2>&1
  then rows+=("ok    landing-audit $(grep -c 'нарушений 0, предупреждений 0' "$out/audit.log") прогонов чисто"); else rows+=("FAIL  landing-audit (журнал $out/audit.log)"); fail=1; fi
  if (cd "$out" && NODE_PATH=/opt/node22/lib/node_modules node "$skill/ui-checks.mjs" --base "http://127.0.0.1:$port") > "$out/ui.log" 2>&1 \
      && grep -q "Замечаний нет" "$out/ui.log"
  then rows+=("ok    ui-checks"); else rows+=("FAIL  ui-checks (журнал $out/ui.log)"); fail=1; fi
  # Сервер работает отдельным процессом next-server, номер из server.pid его не
  # останавливает: гасим процессы с этим портом и рабочим каталогом внутри копии.
  stop_server() {
    local sig=$1 p
    for p in /proc/[0-9]*; do
      case "$(readlink "$p/cwd" 2>/dev/null)" in
        "$dir"/app*) tr '\0' '\n' < "$p/environ" 2>/dev/null | grep -qx "PORT=$port" && kill "-$sig" "${p#/proc/}" 2>/dev/null ;;
      esac
    done
  }
  stop_server TERM; sleep 3; stop_server KILL
fi
step preview env DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci NEXT_PUBLIC_SITE_URL=https://prodisser.ru npm run build:preview

echo "Проверки $dir ($name, $(git -C "$dir" rev-parse --short HEAD)):"
printf '  %s\n' "${rows[@]}"
echo "  тесты без базы: $(count test)"
echo "  тесты на базе:  $(count db)"
echo "Журналы: $out"
exit $fail
