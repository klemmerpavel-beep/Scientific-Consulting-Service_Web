#!/usr/bin/env bash
# Перенос девяти макетов в компоненты и сверка ассетов сайта ProDisser.
#
#   sync-check.sh            перенести макеты, показать изменённые компоненты,
#                            сверить design/assets с app/public/assets
#   sync-check.sh --check    то же, что CI: после переноса компоненты должны
#                            совпасть с закоммиченными (git diff --exit-code)
#
# Запускать из любого каталога внутри репозитория сайта.
# Код выхода: 0 — всё сходится; 1 — расхождение; 2 — не тот репозиторий.
set -uo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Не репозиторий git" >&2; exit 2; }
cd "$ROOT"
[ -f tools/dc-to-tsx.mjs ] || { echo "Нет tools/dc-to-tsx.mjs — это не репозиторий сайта" >&2; exit 2; }

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1
PAGES=app/src/components/pages
status=0

# Таблица та же, что в CONTRIBUTING.md и .github/workflows/ci.yml.
TABLE="StartPage:StartPage:landing MainPage:PostgradPage:postgrad
StudentsPage:StudentsPage:students BusinessPage:BusinessPage:business
OfferPage:OfferPage:landing PrivacyPage:PrivacyPage:landing
ConsentPage:ConsentPage:landing NotFoundPage:NotFoundPage:landing
ExpertsPage:ExpertsPage:landing"

declare -A before
for f in "$PAGES"/*.tsx "$PAGES"/*.ts; do [ -e "$f" ] || continue; before[$f]=$(sha1sum "$f" | cut -c1-40); done

for t in $TABLE; do
  IFS=: read -r src name source <<< "$t"
  out=$(node tools/dc-to-tsx.mjs "design/$src.dc.html" "$PAGES/$name.tsx" "$name" "$source" 2>&1) \
    || { echo "Перенос $src упал:"; echo "$out"; status=1; continue; }
  # Конвертер перечисляет места, которые не смог разобрать: их правят в макете.
  if echo "$out" | grep -q 'ТРЕБУЕТ РУЧНОЙ ДОРАБОТКИ'; then
    echo "$src: конвертер не разобрал часть макета:"; echo "$out" | sed -n '/ТРЕБУЕТ РУЧНОЙ ДОРАБОТКИ/,$p'; status=1
  fi
done

changed=()
for f in "$PAGES"/*.tsx "$PAGES"/*.ts; do [ -e "$f" ] || continue
  [ "${before[$f]:-}" != "$(sha1sum "$f" | cut -c1-40)" ] && changed+=("$f")
done
if [ ${#changed[@]} -gt 0 ]; then
  echo "Перенесены заново (до переноса не совпадали с макетами):"
  printf '  %s\n' "${changed[@]}"
else
  echo "Компоненты совпадают с макетами."
fi

if [ $CHECK -eq 1 ]; then
  if git diff --quiet -- "$PAGES"; then
    echo "Как в CI: перенос воспроизводим, компоненты совпадают с закоммиченными."
  else
    echo "Как в CI: компоненты расходятся с закоммиченными — закоммитьте их вместе с макетом:"
    git diff --stat -- "$PAGES"
    status=1
  fi
fi

# Ассеты: всё из design/assets должно лежать в app/public/assets байт в байт.
# Обратное не требуется: в public есть файлы, которых нет в макетах.
assets=$(diff -rq design/assets app/public/assets 2>&1 | grep -v '^Only in app/public/assets' || true)
if [ -n "$assets" ]; then
  echo "Ассеты расходятся:"; echo "$assets" | sed 's/^/  /'; status=1
else
  echo "Ассеты design/assets и app/public/assets совпадают."
fi

exit $status
