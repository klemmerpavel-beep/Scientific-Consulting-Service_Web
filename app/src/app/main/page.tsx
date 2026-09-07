import type { Metadata } from 'next';
import Page from '../../components/pages/PostgradPage';
import { meta } from '../../components/pages/PostgradPage.meta';
import { OG_COVER } from '../../components/og-cover';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/main' },
  openGraph: { title: meta.title, description: meta.description, url: '/main', images: [OG_COVER] },
};

export default function Route() {
  return <Page />;
}
