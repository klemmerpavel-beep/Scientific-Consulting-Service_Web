import type { Metadata } from 'next';
import Page from '../../components/pages/ConsentPage';
import { meta } from '../../components/pages/ConsentPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/consent' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/consent', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema requisites />
    </>
  );
}
