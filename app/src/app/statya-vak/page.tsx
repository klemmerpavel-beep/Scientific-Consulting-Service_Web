import type { Metadata } from 'next';
import Page from '../../components/pages/ArticlePage';
import { meta } from '../../components/pages/ArticlePage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/statya-vak' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/statya-vak', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/statya-vak" />
    </>
  );
}
