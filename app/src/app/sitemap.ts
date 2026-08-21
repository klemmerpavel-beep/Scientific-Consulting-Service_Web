import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

const base = () => process.env.NEXT_PUBLIC_SITE_URL ?? '';

// Правовые документы в карте сайта нужны: на них ссылаются формы,
// и поисковику полезно видеть, что условия опубликованы.
const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/main', priority: 0.9 },
  { path: '/students', priority: 0.9 },
  { path: '/business', priority: 0.9 },
  { path: '/offer', priority: 0.3 },
  { path: '/privacy', priority: 0.3 },
  { path: '/consent', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PAGES.map(({ path, priority }) => ({
    url: `${base()}${path}`,
    lastModified: now,
    changeFrequency: priority === 1 ? 'weekly' : 'monthly',
    priority,
  }));
}
