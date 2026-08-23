# Сборка приложения. Многоэтапная: в конечный образ не попадают ни исходники,
# ни инструменты сборки, ни devDependencies — только то, что нужно для работы.

# ---------------------------------------------------------------- зависимости
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --------------------------------------------------------------------- сборка
FROM node:22-alpine AS builder
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

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ------------------------------------------------------------------ миграции
# Отдельный слой для наката схемы. В рабочем образе Next оставляет только те
# модули, которые требует server.js: командной строки prisma там нет, и
# `npx prisma` полез бы за ней в реестр npm прямо на сервере — во время
# развёртывания, неизвестной версией. Здесь лежат и полные зависимости,
# и каталог prisma с миграциями.
FROM node:22-alpine AS migrator
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# ------------------------------------------------------------------- рабочий
FROM node:22-alpine AS runner
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
