import type { Metadata } from 'next';
import Page from '../components/pages/NotFoundPage';
import { meta } from '../components/pages/NotFoundPage.meta';
import { OG_COVER, OG_SITE } from '../components/og-cover';

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  // Страницы по этому адресу нет: индексировать нечего, и переходить по
  // ссылкам с неё поисковику тоже незачем.
  robots: { index: false, follow: false },
  // Ссылка на несуществующий адрес всё равно расходится по мессенджерам:
  // с обложкой видно, чей это сайт, без неё — голый серый прямоугольник.
  // Адрес в openGraph не указываем: у этой страницы его нет.
  openGraph: { ...OG_SITE, title: meta.title, description: meta.description, images: [OG_COVER] },
};

export default function NotFound() {
  return <Page />;
}
