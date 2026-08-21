import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

const base = () => process.env.NEXT_PUBLIC_SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: base() ? `${base()}/sitemap.xml` : undefined,
  };
}
