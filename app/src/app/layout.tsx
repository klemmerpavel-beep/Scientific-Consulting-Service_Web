import type { Metadata, Viewport } from 'next';
import { Literata, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import SiteMotion from '../components/SiteMotion';

// Шрифты забираются при сборке и отдаются с нашего же домена:
// внешних запросов со страниц быть не должно.
//
// Антиква в заголовках, гротеск в тексте, моноширинный в лейблах —
// решение Р-52. Обе основные гарнитуры берутся с полной кириллицей:
// без неё заголовок распадается на подставленные системные глифы.
const literata = Literata({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-serif',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
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
    <html lang="ru" className={`${literata.variable} ${inter.variable} ${mono.variable}`}>
      <body>
        {children}
        <SiteMotion />
      </body>
    </html>
  );
}
