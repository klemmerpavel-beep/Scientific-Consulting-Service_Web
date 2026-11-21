#!/usr/bin/env bash
# Закрыть рабочую копию разработчика: остановить её серверы (по PID, только
# процессы с рабочим каталогом внутри копии), удалить её базы (<имя> и
# <имя>_*), убрать worktree и освободить блок портов. Ветка удаляется, только
# если она уже влита в HEAD основного клона; иначе копия не трогается, пока не
# передан --force (тогда ветка остаётся, удаляется только каталог).
#
#   bash .claude/skills/prodisser-orchestration/scripts/wt-done.sh <имя> [--force]
set -euo pipefail

name=${1:?"имя рабочей копии"}
force=${2:-}
main=$(git worktree list --porcelain | awk 'NR==1{print $2}')
root=$(dirname "$main")
dir="$root/wt-$name"
reg="$root/.wt-registry"
db=${name//-/_}

merged=no
git -C "$main" merge-base --is-ancestor "$name" HEAD 2>/dev/null && merged=yes
if [ "$merged" = no ] && [ "$force" != "--force" ]; then
  echo "ветка $name не влита в $(git -C "$main" rev-parse --abbrev-ref HEAD): копия оставлена (--force — убрать каталог, ветку сохранить)" >&2
  exit 1
fi

# Серверы копии — по PID, только свои (имя процесса next-server, pkill по имени запрещён).
for p in /proc/[0-9]*; do
  cwd=$(readlink "$p/cwd" 2>/dev/null || true)
  case "$cwd" in "$dir"|"$dir"/*) kill "${p#/proc/}" 2>/dev/null && echo "остановлен PID ${p#/proc/} ($cwd)";; esac
done

# Свои базы.
for d in $(sudo -u postgres psql -Atc "select datname from pg_database where datname = '$db' or datname like '${db}\_%'" 2>/dev/null); do
  sudo -u postgres psql -qc "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" && echo "удалена база $d"
done

if [ -d "$dir" ]; then git -C "$main" worktree remove --force "$dir" && echo "убран каталог $dir"; else echo "каталога $dir уже нет"; fi
if [ "$merged" = yes ] && git -C "$main" show-ref --verify --quiet "refs/heads/$name"; then git -C "$main" branch -q -d "$name" && echo "удалена ветка $name"; fi
[ -f "$reg" ] && sed -i "/^$name /d" "$reg"
echo "готово"
