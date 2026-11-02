import type { Metadata } from 'next';
import Page from '../../components/pages/StudentsPage';
import { meta } from '../../components/pages/StudentsPage.meta';
import { OG_COVER, OG_SITE } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/students' },
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, url: '/students', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
    </>
  );
}
