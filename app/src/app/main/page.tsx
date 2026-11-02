import type { Metadata } from 'next';
import Page from '../../components/pages/PostgradPage';
import { meta } from '../../components/pages/PostgradPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/main' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/main', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
    </>
  );
}
