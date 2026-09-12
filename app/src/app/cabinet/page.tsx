import type { Metadata } from 'next';
import Page from '../../components/pages/CabinetPage';
import { meta } from '../../components/pages/CabinetPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/cabinet' },
  // Раздел готовится и ничего не содержит: в поиске ему делать нечего.
  robots: { index: false, follow: false },
};

export default function Route() {
  return <Page />;
}
