import type { Metadata } from 'next';
import Page from '../../components/pages/ToolsPage';
import { meta } from '../../components/pages/ToolsPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

/**
 * «Инструменты» (решение Р-793): бесплатный оформитель списка литературы по
 * ГОСТ Р 7.0.100-2018. Страница открыта поиску и стоит в карте сайта: она
 * собирает справочный спрос «оформить список литературы по ГОСТ», которого
 * у содержательных страниц нет (П-1 конкурентного разбора 03.11.2026).
 * Оформитель работает в браузере: введённое на сервер не уходит.
 */
export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/tools' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/tools', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
    </>
  );
}
