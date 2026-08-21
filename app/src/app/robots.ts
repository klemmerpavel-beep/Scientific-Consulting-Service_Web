import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

const base = () => process.env.NEXT_PUBLIC_SITE_URL;

export default function robots(): MetadataRoute.Robots {
  // Демонстрационный стенд закрывается целиком: временный адрес не должен
  // попасть в выдачу и перебить будущий боевой.
  if (process.env.NEXT_PUBLIC_DEMO_STAND === '1') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: base() ? `${base()}/sitemap.xml` : undefined,
  };
}
