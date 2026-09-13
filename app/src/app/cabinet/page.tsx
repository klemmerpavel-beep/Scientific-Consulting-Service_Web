import type { Metadata } from 'next';
import Page from '../../components/pages/CabinetPage';
import { meta } from '../../components/pages/CabinetPage.meta';
import { OG_COVER } from '../../components/og-cover';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/cabinet' },
  openGraph: { title: meta.title, description: meta.description, url: '/cabinet', images: [OG_COVER] },
  // Раздел готовится и ничего не содержит: в поиске ему делать нечего.
  robots: { index: false, follow: false },
};

export default function Route() {
  return <Page />;
}
