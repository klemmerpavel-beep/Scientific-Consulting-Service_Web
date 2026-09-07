import type { Metadata } from 'next';
import Page from '../../components/pages/OfferPage';
import { meta } from '../../components/pages/OfferPage.meta';
import { OG_COVER } from '../../components/og-cover';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/offer' },
  openGraph: { title: meta.title, description: meta.description, url: '/offer', images: [OG_COVER] },
};

export default function Route() {
  return <Page />;
}
