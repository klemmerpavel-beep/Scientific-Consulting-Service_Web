// Проект собирается в двух видах.
//
// Рабочий сайт — самодостаточная сборка для контейнера на российском
// сервере: она запускается как `node .next/standalone/server.js` и умеет
// принимать заявки.
//
// Витрина — статические файлы для показа проекта: страницы и переходы
// работают, сервера за ними нет, приём заявок отключён (см. submit-lead).
// Лежит в подпапке домена, поэтому ссылки и адреса ресурсов получают
// общий префикс из PREVIEW_BASE_PATH.
const preview = process.env.NEXT_PUBLIC_PREVIEW === '1';
const basePath = preview ? (process.env.PREVIEW_BASE_PATH ?? '') : '';

/**
 * Политика содержимого.
 *
 * Запрещено главное: чужие сценарии, кадры и объекты, встраивание сайта в
 * чужую страницу и отправка форм на чужой адрес. Сетевые запросы — только
 * к своему источнику; письма и Telegram уходят с сервера, браузеру наружу
 * ходить незачем.
 *
 * 'unsafe-inline' оставлен сознательно и в обоих местах по разным причинам.
 * Стили: страницы перенесены из макетов и держат оформление в атрибутах
 * style — вынести их в файл значит переписать перенос целиком. Сценарии:
 * Next вставляет в разметку встроенные вставки для оживления страницы;
 * убрать их можно только одноразовым кодом из middleware, а он переводит
 * все страницы в динамическую отрисовку и лишает сайт предсобранной
 * статики. Ни в одну страницу не попадает текст, полученный от посетителя,
 * поэтому вставить свой сценарий через содержимое некуда.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(preview
    ? {
        output: 'export',
        basePath,
        assetPrefix: basePath || undefined,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : { output: 'standalone' }),

  poweredByHeader: false,
  reactStrictMode: true,

  // Заголовки безопасности выставляет сервер. В статической витрине сервера
  // нет — там их задаёт площадка, и объявлять их здесь бессмысленно.
  ...(preview
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'X-Frame-Options', value: 'DENY' },
                {
                  key: 'Permissions-Policy',
                  value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
                },
                { key: 'Content-Security-Policy', value: CSP },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
