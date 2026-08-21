/** @type {import('next').NextConfig} */
const nextConfig = {
  // Самодостаточная сборка нужна контейнеру на своём сервере: он запускает
  // .next/standalone/server.js. На Vercel сервера нет — там страницы и
  // маршруты раскладываются по функциям платформы, и standalone только
  // ломает раскладку. VERCEL=1 выставляет сама платформа.
  output: process.env.VERCEL ? undefined : 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      ],
    }];
  },
};
export default nextConfig;
