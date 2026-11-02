import type { Metadata } from 'next';
import Page from '../../components/pages/OfferPage';
import { meta } from '../../components/pages/OfferPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/offer' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/offer', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema requisites />
    </>
  );
}
