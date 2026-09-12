import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  // Демонстрационный стенд закрывается целиком: временный адрес не должен
  // попасть в выдачу и перебить будущий боевой.
  if (process.env.NEXT_PUBLIC_DEMO_STAND === '1') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  const base = siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: base ? `${base}/sitemap.xml` : undefined,
  };
}
