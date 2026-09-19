# Сборка приложения. Многоэтапная: в конечный образ не попадают ни исходники,
# ни инструменты сборки, ни devDependencies — только то, что нужно для работы.

# Базовый образ задаётся снаружи. Docker Hub считает обращения с одного адреса
# и при их избытке отвечает «429 Too Many Requests» — сборка падала, хотя
# ничего в проекте не менялось. Скрипт выката подтягивает образ заранее и
# передаёт сюда локальную метку, поэтому сборка в реестр не ходит вовсе
# (решение Р-159). Умолчание оставлено прежним: без скрипта образ собирается
# так же, как собирался.
ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------- зависимости
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Схема базы копируется вместе с манифестами, до установки: в package.json
# есть postinstall с `prisma generate`, а Prisma 7 без схемы не просто молчит,
# а завершает установку с ошибкой. Без этих двух строк образ не собирается
# вовсе — на чистой машине, где нет кэша слоёв (решение Р-118).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# --------------------------------------------------------------------- сборка
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Клиент базы генерируется до сборки: код страниц его импортирует.
# Настоящий адрес базы на этом шаге не нужен и намеренно не передаётся —
# в образ не должно попасть ничего от продакшн-окружения.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npx prisma generate

# Публичный адрес нужен на сборке: canonical и Open Graph статических
# страниц вычисляются заранее. Передаётся так:
#   docker build --build-arg NEXT_PUBLIC_SITE_URL=https://prodisser.ru .
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Номер счётчика посещаемости. Пустой по умолчанию: без него со страниц
# не уходит ни одного внешнего запроса. Подставляется при сборке, потому
# что переменные NEXT_PUBLIC_* вшиваются в разметку, а не читаются в работе.
ARG NEXT_PUBLIC_METRIKA_ID=""
ENV NEXT_PUBLIC_METRIKA_ID=$NEXT_PUBLIC_METRIKA_ID

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ------------------------------------------------------------------ миграции
# Отдельный слой для наката схемы. В рабочем образе Next оставляет только те
# модули, которые требует server.js: командной строки prisma там нет, и
# `npx prisma` полез бы за ней в реестр npm прямо на сервере — во время
# развёртывания, неизвестной версией. Здесь лежат и полные зависимости,
# и каталог prisma с миграциями.
FROM ${NODE_IMAGE} AS migrator
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# ----------------------------------------------------------- разовые средства
# Выгрузки в таблицу, заведение учётной записи кабинета, выдача ссылки входа.
# В рабочем образе их запустить нельзя: туда попадает только `.next/standalone`,
# без исходников, без каталога scripts и без полных зависимостей — так задумано.
# Слой собран по образцу стадии миграций: отдельный образ, который поднимается
# на один запуск и гаснет.
#
#   docker compose --profile tools run --rm tools scripts/export-leads.mjs --stdout
#
# Берётся готовый слой сборки: в нём уже лежат исходники, зависимости и
# сгенерированный клиент базы. Размер значения не имеет — образ разовый.
FROM builder AS tools
WORKDIR /app
ENV NODE_ENV=production
# Скрипты кабинета написаны на TypeScript и запускаются без сборки: Node 22
# снимает типы сам. На сборках, где это ещё за флагом, без переменной запуск
# кончился бы синтаксической ошибкой на первом же объявлении типа.
ENV NODE_OPTIONS=--experimental-strip-types
ENTRYPOINT ["node"]

# ------------------------------------------------------------------- рабочий
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Приложение не работает от суперпользователя
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
