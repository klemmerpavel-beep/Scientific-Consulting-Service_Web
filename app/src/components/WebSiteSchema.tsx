import { siteUrl } from '../lib/site-url';

/**
 * Описание сайта для поисковых систем (schema.org `WebSite`, JSON-LD) —
 * только на главной (Р-779).
 *
 * По нему поисковик берёт имя сайта, которое показывает в выдаче над
 * заголовком страницы; без него имя подбирается из title и ссылок и может
 * оказаться адресом или чужим написанием. Разметка организации
 * (`OrgSchema`) описывает компанию, эта — сайт; Google рекомендует ставить
 * её на главную страницу.
 */
export default function WebSiteSchema() {
  const url = siteUrl();
  // Как у разметки организации: без адреса сайта привязать нечего, а
  // демонстрационный стенд второго «официального» сайта не заявляет.
  if (!url || process.env.NEXT_PUBLIC_PREVIEW === '1') return null;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ProDisser',
    url: `${url}/`,
    inLanguage: 'ru',
  };

  return (
    <script
      type="application/ld+json"
      // Данные наши собственные и статические: подставлять сюда нечего,
      // экранировать нечего.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
