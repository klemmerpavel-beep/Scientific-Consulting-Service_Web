import type { Metadata } from 'next';
import Page from '../../components/pages/BusinessPage';
import { meta } from '../../components/pages/BusinessPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/business' },
  openGraph: { title: meta.title, description: meta.description, url: '/business' },
};

export default function Route() {
  return <Page />;
}
