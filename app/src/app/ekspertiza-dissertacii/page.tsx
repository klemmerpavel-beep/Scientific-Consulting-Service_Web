import type { Metadata } from 'next';
import Page from '../../components/pages/ExpertisePage';
import { meta } from '../../components/pages/ExpertisePage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';
import BreadcrumbSchema from '../../components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/ekspertiza-dissertacii' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/ekspertiza-dissertacii', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/ekspertiza-dissertacii" />
      <BreadcrumbSchema page="/ekspertiza-dissertacii" />
    </>
  );
}
