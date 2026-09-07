import type { Metadata } from 'next';
import Page from '../../components/pages/PrivacyPage';
import { meta } from '../../components/pages/PrivacyPage.meta';
import { OG_COVER } from '../../components/og-cover';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/privacy' },
  openGraph: { title: meta.title, description: meta.description, url: '/privacy', images: [OG_COVER] },
};

export default function Route() {
  return <Page />;
}
