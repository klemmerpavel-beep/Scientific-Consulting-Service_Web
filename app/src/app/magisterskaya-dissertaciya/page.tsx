import type { Metadata } from 'next';
import Page from '../../components/pages/MasterPage';
import { meta } from '../../components/pages/MasterPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';
import FaqSchema from '../../components/FaqSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/magisterskaya-dissertaciya' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/magisterskaya-dissertaciya', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <FaqSchema page="/magisterskaya-dissertaciya" />
    </>
  );
}
