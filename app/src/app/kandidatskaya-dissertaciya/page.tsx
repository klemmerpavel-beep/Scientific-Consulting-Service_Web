import type { Metadata } from 'next';
import Page from '../../components/pages/CandidatePage';
import { meta } from '../../components/pages/CandidatePage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';
import BreadcrumbSchema from '../../components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/kandidatskaya-dissertaciya' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/kandidatskaya-dissertaciya', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/kandidatskaya-dissertaciya" />
      <BreadcrumbSchema page="/kandidatskaya-dissertaciya" />
    </>
  );
}
