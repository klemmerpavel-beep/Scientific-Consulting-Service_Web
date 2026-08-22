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
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
