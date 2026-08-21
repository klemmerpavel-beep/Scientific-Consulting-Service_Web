import type { Metadata } from 'next';
import Page from '../components/pages/StartPage';
import { meta } from '../components/pages/StartPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/' },
  openGraph: { title: meta.title, description: meta.description, url: '/' },
};

export default function Route() {
  return <Page />;
}
