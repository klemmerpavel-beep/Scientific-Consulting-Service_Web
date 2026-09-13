import type { Metadata } from 'next';
import Page from '../components/pages/NotFoundPage';
import { meta } from '../components/pages/NotFoundPage.meta';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  // Страницы по этому адресу нет: индексировать нечего, и переходить по
  // ссылкам с неё поисковику тоже незачем.
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <Page />;
}
