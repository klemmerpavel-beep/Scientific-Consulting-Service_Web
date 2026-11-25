import { BREADCRUMBS } from '../../content/breadcrumbs.generated';
import { siteUrl } from '../lib/site-url';

/**
 * Навигационная цепочка страницы для поисковых систем (schema.org,
 * BreadcrumbList; решение Р-1018).
 *
 * Звенья берутся из `content/breadcrumbs.generated.ts` — файла, который
 * `tools/seo-sync.mjs` переписывает из цепочки, набранной в макете. В
 * разметке поэтому те же названия и тот же порядок, что видит посетитель
 * над заголовком страницы. По цепочке Яндекс показывает в сниппете путь
 * «Главная › Аспирантам › …» вместо адреса.
 *
 * Адреса звеньев абсолютные; без известного адреса сайта и в витрине
 * разметки нет — как у разметки организации.
 */
export default function BreadcrumbSchema({ page }: { page: string }) {
  const trail = BREADCRUMBS[page];
  const url = siteUrl();
  if (!trail?.length || !url || process.env.NEXT_PUBLIC_PREVIEW === '1') return null;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(({ name, path }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: `${url}${path === '/' ? '/' : path}`,
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Данные наши собственные и статические; «<» экранируется, как в FaqSchema.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</gu, '\\u003c') }}
    />
  );
}
