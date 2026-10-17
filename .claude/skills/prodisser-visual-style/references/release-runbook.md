# Команды: от окружения до выката

Пути скриптов — относительно каталога скилла; команды репозитория — из его
корня, если не сказано иное. `S` — временный каталог исполнителя
(scratchpad), не каталог проекта.

## Содержание

1. Окружение
2. Сайт локально и замер
3. Перенос и сверка
4. Проверки перед отправкой
5. Журнал решений
6. Ветка, коммит, запрос на слияние
7. Слияние и выкат
8. Откат

## 1. Окружение

```bash
git clone https://github.com/klemmerpavel-beep/scientific-consulting-service_web
cd scientific-consulting-service_web/app && npm ci && npx prisma generate
npm i --prefix "$S/axe" axe-core      # вне проекта: зависимость не добавляется (Р-168)
```

Если в той же рабочей копии работает другой сеанс (появляются чужие
коммиты и незакоммиченные правки), свою работу вести в отдельном каталоге
(`git worktree add ../site-<задача> -b <ветка> origin/main`) и чужие правки
не трогать: никаких `stash` и `checkout` поверх них.

Клон с одной веткой получает только `main`. Для своей ветки — refspec:

```bash
git config --add remote.origin.fetch \
  "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
git fetch origin && git branch --set-upstream-to="origin/$BRANCH"
```

## 2. Сайт локально и замер

```bash
cd app && (env -u DATABASE_URL nohup npx next dev -p 3200 > "$S/dev.log" 2>&1 &)
until curl -s -o /dev/null -w '%{http_code}' http://localhost:3200/ | grep -q 200; do sleep 2; done
cd .. && node <скилл>/scripts/landing-audit.mjs --base http://localhost:3200 \
  --paths /,/main,/students,/business,/experts,/nope \
  --out "$S/audit-before" --axe "$S/axe/node_modules/axe-core/axe.min.js"
pkill -f "[n]ext dev -p 3200"         # скобки: иначе шаблон совпадёт с самой оболочкой
```

Страницы, которым нужна база (кабинет), локально не открываются — для
содержательных страниц она не нужна. В углу страницы в режиме разработки
бывает метка «1 Issue»: это CSP и `eval` режима разработки, в рабочей
сборке её нет.

## 3. Перенос и сверка

```bash
<скилл>/scripts/sync-check.sh          # переносит девять макетов, сверяет .tsx и ассеты
```

Код выхода 0 — перенос воспроизводим (то же требует CI), ассеты
`design/assets` есть в `app/public/assets`.

## 4. Проверки перед отправкой

```bash
cd app
npm run typecheck
env -u DATABASE_URL npm test          # как в CI; с адресом без базы падают *.db.test.ts
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci NEXT_PUBLIC_SITE_URL=https://prodisser.ru npm run build
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci npm run build:preview
cd .. && node <скилл>/scripts/landing-audit.mjs --base http://localhost:3200 --paths /main,/students --out "$S/audit-after" --axe …
node <скилл>/scripts/ui-checks.mjs --base http://localhost:3200 --out "$S/ui"
```

Если меняется оформление формы — отправка заявки проверяется вручную.
Снимки изменённых мест на 1440 и 390 px просматриваются глазами (Р-102).

## 5. Журнал решений

```bash
python3 <скилл>/scripts/journal-append.py --repo . --next
python3 <скилл>/scripts/journal-append.py --repo . \
  --entry "$S/r-NNN.md" --summary "Строка сводки без номера"
```

Файл записи начинается с `## Р-NNN · Заголовок (дд.мм.гггг)`. Скрипт
откажет, если номер занят, если запись без заголовка или если после записи
в журнале не хватает хотя бы одной прежней строки.

## 6. Ветка, коммит, запрос на слияние

- Ветка — от свежего `main`. Если запрос с этой ветки уже влит, ветка
  перезапускается от `main` (`git merge --ff-only origin/main`, если в
  ней нет своих неслитых коммитов).
- Коммит — одно решение; заголовок «Р-NNN: суть»; в конце — подписи
  соавторства, требуемые средой.
- Запрос на слияние — по разделам `.github/pull_request_template.md`:
  «Что изменилось», «Где правилось», «Проверки» (с числами прогонов),
  «Границы, которые правка не нарушает», «Решение».
- Запрос создаётся инструментом GitHub среды (`create_pull_request`) или
  REST; `gh pr create` в облачном контейнере может упасть на GraphQL (403).
- Подписка на события запроса; при красном CI — разбор причины и
  исправление, а не перезапуск.

## 7. Слияние и выкат

Слияние — только по согласию владельца на выкат (SKILL.md, шаг 8),
способом `merge` (в репозитории приняты коммиты слияния
«Merge pull request #N: …»), с проверкой головы запроса.

После слияния в `main` идут два процесса:

| Процесс | Запуск | Время | Результат |
|---|---|---|---|
| «Сборка и проверки» (`ci.yml`) | push в `main` | ≈ 12 мин | задания `build`, `db` |
| «Выкат на боевой сервер» (`deploy.yml`) | после успешной «Сборки и проверок» на `main` | ≈ 2 мин | шаг «Сайт отвечает снаружи» |
| «Витрина проекта» (`pages.yml`) | push в `main` | ≈ 1 мин | GitHub Pages |

Состояние — через список запусков GitHub Actions (инструмент
`actions_list`, `list_workflow_runs`; шаги задания — `list_workflow_jobs`).
Ожидание — отложенной самопроверкой примерно через 15 минут, а не
циклом `sleep`.

Ссылки для владельца после успешного выката:

- https://prodisser.ru/, https://prodisser.ru/main, https://prodisser.ru/students,
  https://prodisser.ru/business, https://prodisser.ru/experts;
- витрина: https://klemmerpavel-beep.github.io/Scientific-Consulting-Service_Web/
  (адреса страниц с косой чертой в конце: `/main/`, `/students/`).

Совет владельцу: обновить страницу без кэша (Ctrl+F5).

## 8. Откат

- Если на сервере не прошла проверка здоровья, `deploy/update.sh` сам
  возвращает прежний образ и коммит (схема базы остаётся новой — миграции
  необратимы). После исправления выкат перезапускается вручную:
  «Выкат на боевой сервер» → `workflow_dispatch`.
- Правка снимается по существу новым запросом на слияние с
  `git revert -m 1 <коммит слияния>`, с тем же порядком проверок и выката.
  История `main` не переписывается.
Для принятых страниц точки отката — ветки `accepted/*`.
