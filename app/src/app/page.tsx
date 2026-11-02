import type { Metadata } from 'next';
import Page from '../components/pages/StartPage';
import { meta } from '../components/pages/StartPage.meta';
import { OG_COVER, OG_SITE } from '../components/og-cover';
import OrgSchema from '../components/OrgSchema';
import WebSiteSchema from '../components/WebSiteSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
      <WebSiteSchema />
    </>
  );
}
