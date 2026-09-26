import type { Metadata } from 'next';
import Page from '../../components/pages/StudentsPage';
import { meta } from '../../components/pages/StudentsPage.meta';
import { OG_COVER } from '../../components/og-cover';
import OrgSchema from '../../components/OrgSchema';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: '/students' },
  openGraph: { title: meta.title, description: meta.description, url: '/students', images: [OG_COVER] },
};

export default function Route() {
  return (
    <>
      <Page />
      <OrgSchema />
    </>
  );
}
