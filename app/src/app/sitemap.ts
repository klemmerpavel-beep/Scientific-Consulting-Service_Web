import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';

export const dynamic = 'force-dynamic';

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
  const base = siteUrl();
  // Без адреса сайта карту составить нечем: относительные ссылки делают
  // sitemap.xml недействительным целиком. Пустая карта честнее битой.
  if (!base) return [];

  const now = new Date();
  return PAGES.map(({ path, priority }) => ({
    url: `${base}${path === '/' ? '/' : path}`,
    lastModified: now,
    changeFrequency: priority === 1 ? 'weekly' : 'monthly',
    priority,
  }));
}
