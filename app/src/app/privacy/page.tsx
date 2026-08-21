import type { Metadata } from 'next';
import Page from '../../components/pages/PrivacyPage';
import { meta } from '../../components/pages/PrivacyPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/privacy' },
  openGraph: { title: meta.title, description: meta.description, url: '/privacy' },
};

export default function Route() {
  return <Page />;
}
