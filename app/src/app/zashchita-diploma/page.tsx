import type { Metadata } from 'next';
import Page from '../../components/pages/DefensePage';
import { meta } from '../../components/pages/DefensePage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';
import BreadcrumbSchema from '../../components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/zashchita-diploma' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/zashchita-diploma', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/zashchita-diploma" />
      <BreadcrumbSchema page="/zashchita-diploma" />
    </>
  );
}
