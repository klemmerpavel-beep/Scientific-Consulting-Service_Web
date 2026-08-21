import type { Metadata } from 'next';
import Page from '../../components/pages/ConsentPage';
import { meta } from '../../components/pages/ConsentPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/consent' },
  openGraph: { title: meta.title, description: meta.description, url: '/consent' },
};

export default function Route() {
  return <Page />;
}
