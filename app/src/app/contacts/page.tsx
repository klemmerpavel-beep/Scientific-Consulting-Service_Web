import type { Metadata } from 'next';
import Page from '../../components/pages/ContactsPage';
import { meta } from '../../components/pages/ContactsPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/contacts' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/contacts', images: [OG_COVER] },
};

// Страница контактов выводит реквизиты общества, поэтому и разметка
// организации здесь — с реквизитами и адресом, как на правовых страницах
// (Р-404, Р-1015).
export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema requisites />
    </>
  );
}
