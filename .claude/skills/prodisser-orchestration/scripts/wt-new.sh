#!/usr/bin/env bash
# Рабочая копия разработчика: git worktree рядом с основным клоном,
# node_modules жёсткими ссылками (без npm ci), prisma generate, свой блок
# портов и имена своих баз. Запуск из любого каталога клона:
#
#   bash .claude/skills/prodisser-orchestration/scripts/wt-new.sh <имя> [основа]
#
# <имя> — латиница, цифры, дефис (оно же имя ветки и префикс баз);
# [основа] — коммит или ветка, от которой отводится работа (по умолчанию HEAD
# основного клона). Блоки портов — 3410…3499 по десять, 3400—3409 остаются
# оркестратору. Реестр занятых блоков — <родитель клона>/.wt-registry.
set -euo pipefail

name=${1:?"имя рабочей копии"}
[[ $name =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "имя — латиница в нижнем регистре, цифры, дефис" >&2; exit 1; }
main=$(git worktree list --porcelain | awk 'NR==1{print $2}')
base=${2:-$(git -C "$main" rev-parse HEAD)}
root=$(dirname "$main")
dir="$root/wt-$name"
reg="$root/.wt-registry"
db=${name//-/_}

[ -e "$dir" ] && { echo "уже есть: $dir" >&2; exit 1; }
git -C "$main" show-ref --verify --quiet "refs/heads/$name" && { echo "ветка $name уже есть" >&2; exit 1; }
touch "$reg"
port=""
for k in 0 1 2 3 4 5 6 7 8; do
  p=$((3410 + 10 * k))
  grep -q " $p\$" "$reg" || { port=$p; break; }
done
[ -n "$port" ] || { echo "нет свободного блока портов: освободите wt-done.sh" >&2; exit 1; }

git -C "$main" worktree add -q -b "$name" "$dir" "$base"
cp -al "$main/app/node_modules" "$dir/app/node_modules"
(cd "$dir/app" && npx prisma generate >/dev/null 2>&1)
echo "$name $port" >> "$reg"

cat <<EOF
Рабочая копия: $dir
Ветка: $name от $(git -C "$dir" rev-parse --short HEAD)
Порты: $port—$((port + 9))
Базы: $db (тесты), ${db}_artboards (съёмка кабинета), ${db}_* — прочие; чужие базы не трогать
Закрыть: bash .claude/skills/prodisser-orchestration/scripts/wt-done.sh $name
EOF
