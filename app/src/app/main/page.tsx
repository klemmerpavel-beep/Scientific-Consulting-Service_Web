import type { Metadata } from 'next';
import Page from '../../components/pages/PostgradPage';
import { meta } from '../../components/pages/PostgradPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/main' },
  openGraph: { title: meta.title, description: meta.description, url: '/main' },
};

export default function Route() {
  return <Page />;
}
