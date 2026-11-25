import type { Metadata } from 'next';
import Page from '../../components/pages/NormPage';
import { meta } from '../../components/pages/NormPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/normokontrol' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/normokontrol', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/normokontrol" />
    </>
  );
}
