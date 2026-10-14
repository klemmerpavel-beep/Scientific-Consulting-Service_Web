import type { Metadata } from 'next';
import Page from '../../components/pages/ExpertsPage';
import { meta } from '../../components/pages/ExpertsPage.meta';
import { OG_COVER } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

/**
 * «Экспертам» (решение Р-580): страница для кандидатов в эксперты. На неё
 * ведёт кнопка с главной; в рекламу и в поиск она не выставляется —
 * `noindex` и вне карты сайта: в выдаче она собирала бы запросы «стать
 * автором работ», которых практика не ведёт.
 */
export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/experts' },
  robots: { index: false, follow: true },
  openGraph: { title: meta.title, description: meta.description, url: '/experts', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
    </>
  );
}
