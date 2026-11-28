import { FAQ } from '../../content/faq.generated';

/**
 * Разметка раздела «Вопросы» для поисковых систем (schema.org, FAQPage;
 * решение Р-1010).
 *
 * Вопросы и ответы берутся из `content/faq.generated.ts` — файла, который
 * `tools/seo-sync.mjs` переписывает из макета. Текст в разметке поэтому тот
 * же, что на странице, слово в слово: расхождение разметки с видимым
 * текстом поисковик считает недостоверной разметкой. Ответы свёрнутых
 * вопросов стоят в разметке страницы скрытым абзацем (то же решение) — то,
 * что заявлено в FAQPage, робот находит и в самой странице.
 *
 * Неразрывные пробелы макета (Р-1005) заменяются обычными: в сниппете
 * они ничего не дают, а при сравнении строк мешают.
 *
 * В витрине разметки нет, как и разметки организации: демонстрационный
 * стенд в выдачу не попадает.
 */
export default function FaqSchema({ page }: { page: string }) {
  const items = FAQ[page];
  if (!items?.length || process.env.NEXT_PUBLIC_PREVIEW === '1') return null;

  const plain = (text: string) => text.replace(/ /gu, ' ');
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: plain(q),
      acceptedAnswer: { '@type': 'Answer', text: plain(a) },
    })),
  };

  return (
    <script
      type="application/ld+json"
      // Данные наши собственные и статические. Знак «<» экранируется на
      // случай, если в ответе когда-нибудь появится угловая скобка: закрыть
      // тег script из текста ответа нельзя.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</gu, '\\u003c') }}
    />
  );
}
