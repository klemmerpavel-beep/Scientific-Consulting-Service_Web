import type { Metadata } from 'next';
import Page from '../../components/pages/RemarksPage';
import { meta } from '../../components/pages/RemarksPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';
import BreadcrumbSchema from '../../components/BreadcrumbSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/zamechaniya-k-diplomu' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/zamechaniya-k-diplomu', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/zamechaniya-k-diplomu" />
      <BreadcrumbSchema page="/zamechaniya-k-diplomu" />
    </>
  );
}
