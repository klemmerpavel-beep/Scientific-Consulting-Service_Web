import type { Metadata } from 'next';
import Page from '../../components/pages/PatentPage';
import { meta } from '../../components/pages/PatentPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';
import BreadcrumbSchema from '../../components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/patent' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/patent', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/patent" />
      <BreadcrumbSchema page="/patent" />
    </>
  );
}
