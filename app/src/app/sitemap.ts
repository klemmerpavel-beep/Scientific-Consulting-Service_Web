import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/site-url';
import { PAGE_DATES } from '../../content/page-dates.generated';

export const dynamic = 'force-dynamic';

// Правовые документы в карте сайта нужны: на них ссылаются формы,
// и поисковику полезно видеть, что условия опубликованы.
const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/main', priority: 0.9 },
  { path: '/students', priority: 0.9 },
  { path: '/business', priority: 0.9 },
  // Посадочные под кластеры запросов (Р-1016).
  { path: '/kandidatskaya-dissertaciya', priority: 0.8 },
  { path: '/niokr', priority: 0.8 },
  // Ещё пять кластеров по тому же образцу (Р-1017).
  { path: '/magisterskaya-dissertaciya', priority: 0.8 },
  { path: '/statya-vak', priority: 0.8 },
  { path: '/normokontrol', priority: 0.8 },
  { path: '/patent', priority: 0.8 },
  { path: '/grant', priority: 0.8 },
  { path: '/tools', priority: 0.6 },
  { path: '/contacts', priority: 0.5 },
  { path: '/offer', priority: 0.3 },
  { path: '/privacy', priority: 0.3 },
  { path: '/consent', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Демонстрационный стенд закрыт в robots.txt целиком; карта, которая при
  // этом перечисляет его страницы, противоречит запрету и подсказывает
  // роботу адреса, которые тот не должен обходить.
  if (process.env.NEXT_PUBLIC_DEMO_STAND === '1') return [];

  const base = siteUrl();
  // Без адреса сайта карту составить нечем: относительные ссылки делают
  // sitemap.xml недействительным целиком. Пустая карта честнее битой.
  if (!base) return [];

  // Дата изменения — дата последней правки макета страницы (Р-1010). До
  // того поле не выводилось (Р-254): прежде стояло «сейчас» на каждый
  // запрос, и поисковик, видя постоянно новую дату при неизменной странице,
  // перестаёт доверять полю по всему сайту, а честной даты у страниц не
  // было. Теперь она есть: `content/page-dates.generated.ts` хранит свёртку
  // макета и дату, которая меняется только вместе со свёрткой. Страница без
  // записи выходит без даты — как прежде.
  return PAGES.map(({ path, priority }) => ({
    url: `${base}${path === '/' ? '/' : path}`,
    ...(PAGE_DATES[path] ? { lastModified: PAGE_DATES[path].date } : {}),
    changeFrequency: priority === 1 ? 'weekly' : 'monthly',
    priority,
  }));
}
