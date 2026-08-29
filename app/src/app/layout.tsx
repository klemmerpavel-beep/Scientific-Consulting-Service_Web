import type { Metadata, Viewport } from 'next';
import { Onest, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import SiteMotion from '../components/SiteMotion';

// Шрифты забираются при сборке и отдаются с нашего же домена:
// внешних запросов со страниц быть не должно.
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

/**
 * Демонстрационный стенд закрыт от поисковиков. Иначе временный адрес
 * попадает в выдачу, перебивает будущий боевой и разводит посетителей
 * по двум разным сайтам. Включается переменной DEMO_STAND=1.
 */
const demoStand = process.env.NEXT_PUBLIC_DEMO_STAND === '1';

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL
    ? new URL(process.env.NEXT_PUBLIC_SITE_URL)
    : undefined,
  applicationName: 'ProDisser',
  authors: [{ name: 'ООО «РУСДРОН»' }],
  openGraph: { siteName: 'ProDisser', locale: 'ru_RU', type: 'website' },
  robots: demoStand ? { index: false, follow: false } : { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${onest.variable} ${mono.variable}`}>
      <body>
        {children}
        <SiteMotion />
      </body>
    </html>
  );
}
