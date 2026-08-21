import type { Metadata } from 'next';
import Page from '../../components/pages/OfferPage';
import { meta } from '../../components/pages/OfferPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/offer' },
  openGraph: { title: meta.title, description: meta.description, url: '/offer' },
};

export default function Route() {
  return <Page />;
}
