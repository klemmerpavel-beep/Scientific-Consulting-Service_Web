import type { Metadata, Viewport } from 'next';
import { siteUrl } from '../lib/site-url';
import localFont from 'next/font/local';
import './globals.css';
import SiteMotion from '../components/SiteMotion';
import Metrika from '../components/Metrika';

// Шрифты лежат в репозитории (`src/fonts/`, лицензия OFL рядом) и
// отдаются с нашего же домена: внешних запросов нет ни со страниц, ни у
// сборки. Прежде они забирались с Google Fonts при каждой сборке, и сбой
// загрузки дважды ронял конвейер и один раз выкат (решение Р-230). Файлы
// готовит `tools/fonts-subset.py` из тех же исходников, что отдаёт Google.
//
// Имя семейства задано явно — то же, что у Google: по нему к гарнитурам
// обращаются макеты. Запасные начертания и переменные — в `globals.css`;
// next/font здесь даёт файл со свёрткой в имени и предзагрузку. По имени
// постоянные не используются: правила и предзагрузку регистрирует сам
// вызов, а присвоить его постоянной требует next/font.
//
// Антиква в заголовках, гротеск в тексте, моноширинный в лейблах —
// решение Р-52. Все три гарнитуры несут полную кириллицу: без неё
// заголовок распадается на подставленные системные глифы.
const literata = localFont({
  src: '../fonts/literata.woff2',
  weight: '400 600',
  declarations: [{ prop: 'font-family', value: "'Literata'" }],
  display: 'swap',
  adjustFontFallback: false,
});

const inter = localFont({
  src: '../fonts/inter.woff2',
  weight: '400 700',
  declarations: [{ prop: 'font-family', value: "'Inter'" }],
  display: 'swap',
  adjustFontFallback: false,
});

const mono = localFont({
  src: '../fonts/jetbrains-mono.woff2',
  weight: '400 600',
  declarations: [{ prop: 'font-family', value: "'JetBrains Mono'" }],
  display: 'swap',
  adjustFontFallback: false,
});

/**
 * Демонстрационный стенд закрыт от поисковиков. Иначе временный адрес
 * попадает в выдачу, перебивает будущий боевой и разводит посетителей
 * по двум разным сайтам. Включается переменной DEMO_STAND=1.
 */
const demoStand = process.env.NEXT_PUBLIC_DEMO_STAND === '1';

export const metadata: Metadata = {
  metadataBase: siteUrl()
    ? new URL(siteUrl() as string)
    : undefined,
  applicationName: 'ProDisser',
  authors: [{ name: 'ООО «РУСДРОН»' }],
  // Обложка объявлена в каждой странице, а не здесь: Next заменяет
  // родительский блок openGraph целиком, и картинка из макета отсюда до
  // страниц не доходила бы. Описатель — `components/og-cover.ts`.
  openGraph: { siteName: 'ProDisser', locale: 'ru_RU', type: 'website' },
  twitter: { card: 'summary_large_image' },
  robots: demoStand ? { index: false, follow: false } : { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <SiteMotion />
        <Metrika />
      </body>
    </html>
  );
}
