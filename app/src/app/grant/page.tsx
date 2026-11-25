import type { Metadata } from 'next';
import Page from '../../components/pages/GrantPage';
import { meta } from '../../components/pages/GrantPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/grant' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/grant', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/grant" />
    </>
  );
}
