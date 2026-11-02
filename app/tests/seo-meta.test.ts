/**
 * Поисковые признаки посадочных после SEO-аудита 02.11.2026
 * (`marketing/research/08-seo-аудит-сайта.md`). Проверка по исходникам:
 * макет — источник правды, перенесённый `.meta.ts` — то, что уходит в
 * `<title>` и `<meta name="description">`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/** title и description макета, как их читает конвертер. */
function head(page: string): { title: string; description: string } {
  const html = read('design', `${page}.dc.html`);
  const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1] ?? '';
  const description = /<meta name="description" content="([^"]*)">/u.exec(html)?.[1] ?? '';
  return { title, description };
}

describe('«Аспирантам» отвечает запросу «сопровождение диссертации» (Р-773)', () => {
  const { title, description } = head('MainPage');

  it('слово «диссертация» — в title и в description', () => {
    assert.match(title, /сопровождение диссертации/iu);
    assert.match(description, /диссертаци/iu);
  });

  it('title помещается в выдачу: до 60 знаков', () => {
    assert.ok(title.length <= 60, `title ${title.length} знаков: «${title}»`);
  });

  it('перенесённый код совпадает с макетом', () => {
    const meta = read('app', 'src', 'components', 'pages', 'PostgradPage.meta.ts');
    assert.ok(meta.includes(JSON.stringify(title)), 'title в PostgradPage.meta.ts не совпадает с макетом');
    assert.ok(meta.includes(JSON.stringify(description)), 'description в PostgradPage.meta.ts не совпадает с макетом');
  });
});

describe('«Аспирантам»: «диссертация» и «нормоконтроль» в тексте первого экрана и раздела услуг (Р-774)', () => {
  const sources = [read('design', 'MainPage.dc.html'), read('app', 'src', 'components', 'pages', 'PostgradPage.tsx')];

  it('лид первого экрана называет диссертацию', () => {
    for (const source of sources) assert.match(source, />Разбираем методологию диссертации, ведём научную редактуру/u);
  });

  it('заголовок раздела услуг — «Сопровождаем диссертацию от первой главы до защиты», подсветка на прежнем месте', () => {
    for (const source of sources) {
      // Предлоги в подсветке стоят с неразрывным пробелом (§3.4).
      assert.match(source, />Сопровождаем диссертацию <span[^>]*>от\u00a0первой главы до\u00a0защиты<\/span><\/h2>/u);
    }
  });

  it('карточка услуги называет нормоконтроль', () => {
    for (const source of sources) assert.match(source, /'pd-gost', 'Нормоконтроль по ГОСТ и требованиям ВАК'/u);
  });
});

describe('описание страницы помещается в сниппет: до 160 знаков (Р-775)', () => {
  // Правовые страницы входят в перечень: их описание тоже показывается в
  // выдаче. Текст правовых документов этим правилом не затрагивается —
  // только мета-описание.
  const pages = [
    'StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage',
    'OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage',
  ];
  for (const page of pages) {
    it(page, () => {
      const { description } = head(page);
      assert.ok(description.length > 0, `у ${page} нет description`);
      assert.ok(description.length <= 160, `description ${page} — ${description.length} знаков: «${description}»`);
    });
  }

  it('на главной призыв «первичная консультация бесплатно» остаётся в описании', () => {
    assert.match(head('StartPage').description, /первичная консультация бесплатно\.$/iu);
  });

  it('на «Студентам» описание называет сопровождение диплома и ВКР', () => {
    assert.match(head('StudentsPage').description, /^Сопровождение диплома и ВКР/u);
  });
});

describe('robots.txt: метки рекламы не плодят дублей в Яндексе (Р-776)', async () => {
  const { robotsTxt, CLEAN_PARAMS } = await import('../src/app/robots.txt/body.ts');
  const prod = robotsTxt({ demoStand: false, base: 'https://prodisser.ru' });

  it('Clean-param перечисляет метки Директа и отметки перехода Яндекса', () => {
    assert.match(prod, /^Clean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&ysclid$/mu);
    // Каждая метка из объявлений `marketing/campaigns` закрыта.
    const ads = read('marketing', 'campaigns', 'direct.json');
    for (const param of new Set([...ads.matchAll(/[?&](utm_[a-z]+)=/gu)].map((m) => m[1]!))) {
      assert.ok(CLEAN_PARAMS.includes(param), `метка ${param} из объявлений не входит в Clean-param`);
    }
  });

  it('прежние правила на месте: API и кабинет закрыты, страница входа открыта для обхода, карта указана', () => {
    for (const line of ['User-Agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /cabinet/', 'Disallow: /cabinet-preview/', 'Sitemap: https://prodisser.ru/sitemap.xml']) {
      assert.ok(prod.split('\n').includes(line), `нет строки «${line}»`);
    }
    // `Disallow: /cabinet` без косой черты спрятал бы от робота `noindex` страницы входа.
    assert.ok(!prod.split('\n').includes('Disallow: /cabinet'));
  });

  it('демонстрационный стенд закрыт целиком, без карты', () => {
    assert.equal(robotsTxt({ demoStand: true, base: 'https://prodisser.ru' }), 'User-Agent: *\nDisallow: /\n');
  });

  it('без адреса сайта строки карты нет', () => {
    assert.ok(!robotsTxt({ demoStand: false, base: null }).includes('Sitemap:'));
  });
});

describe('доступное имя ссылки содержит её видимую надпись (Р-778)', () => {
  // Ссылка-значок с подписью «VK» и именем «Сообщество ProDisser во
  // ВКонтакте»: голосовое управление («нажать VK») и программа экранного
  // доступа такую ссылку не находят (axe: label-content-name-mismatch).
  const pages = [
    'StartPage', 'MainPage', 'StudentsPage', 'BusinessPage', 'ExpertsPage',
    'OfferPage', 'PrivacyPage', 'ConsentPage', 'NotFoundPage',
  ];
  for (const page of pages) {
    it(page, () => {
      const html = read('design', `${page}.dc.html`);
      for (const m of html.matchAll(/<a [^>]*aria-label="([^"]*)"[^>]*><span aria-hidden="true"[^>]*>([^<]+)<\/span><\/a>/gu)) {
        const [, name, text] = m;
        assert.ok(name!.includes(text!.trim()), `«${name}» не содержит видимую надпись «${text}»`);
      }
    });
  }
});

describe('разметка сайта WebSite — на главной (Р-779)', () => {
  const component = read('app', 'src', 'components', 'WebSiteSchema.tsx');

  it('имя сайта — ProDisser, адрес — главная, язык — русский', () => {
    assert.match(component, /'@type': 'WebSite',\n\s+name: 'ProDisser',\n\s+url: `\$\{url\}\/`,\n\s+inLanguage: 'ru',/u);
  });

  it('стоит на главной и только на ней', () => {
    assert.match(read('app', 'src', 'app', 'page.tsx'), /<WebSiteSchema \/>/u);
    for (const route of ['main', 'students', 'business', 'experts', 'offer', 'privacy', 'consent']) {
      assert.doesNotMatch(read('app', 'src', 'app', route, 'page.tsx'), /WebSiteSchema/u);
    }
  });

  it('витрина и сборка без адреса сайта разметку не выводят', () => {
    assert.match(component, /if \(!url \|\| process\.env\.NEXT_PUBLIC_PREVIEW === '1'\) return null;/u);
  });
});

describe('Open Graph страниц несёт имя сайта, язык и тип (Р-780)', () => {
  const routes = [
    ['app', 'src', 'app', 'page.tsx'],
    ['app', 'src', 'app', 'not-found.tsx'],
    ...['main', 'students', 'business', 'experts', 'offer', 'privacy', 'consent'].map((r) => ['app', 'src', 'app', r, 'page.tsx']),
  ];

  it('общие поля совпадают с layout.tsx', () => {
    assert.match(read('app', 'src', 'components', 'og-cover.ts'), /export const OG_SITE = \{ siteName: 'ProDisser', locale: 'ru_RU', type: 'website' \} as const;/u);
    assert.match(read('app', 'src', 'app', 'layout.tsx'), /openGraph: \{ siteName: 'ProDisser', locale: 'ru_RU', type: 'website' \}/u);
  });

  for (const parts of routes) {
    it(parts.slice(3).join('/'), () => {
      // Блок страницы заменяет родительский целиком: без разворота общие
      // поля до разметки не доходят.
      assert.match(read(...parts), /openGraph: \{ \.\.\.OG_SITE, /u);
    });
  }
});

describe('«Компаниям»: имена кнопок и ссылок содержат видимую надпись (Р-781)', () => {
  const sources = [read('design', 'BusinessPage.dc.html'), read('app', 'src', 'components', 'pages', 'BusinessPage.tsx')];

  it('шкала уровней готовности: «01 Идея — уровень готовности технологии», номер и название разделены пробелом', () => {
    const design = sources[0]!;
    assert.match(design, /aria: '0' \+ num \+ ' ' \+ short \+ ' — уровень готовности технологии',/u);
    // Без пробела axe читает видимую надпись как «01Идея», и имя её не содержит.
    assert.match(design, /\{\{ t\.num \}\}<\/span> <span[^>]*>\{\{ t\.short \}\}<\/span>/u);
    assert.match(sources[1]!, /\{t\.num\}<\/span> <span/u);
  });

  it('ссылка «Обсудить это направление» и кнопки «Чем закреплено»', () => {
    for (const source of sources) {
      assert.match(source, /cta: 'Обсудить это направление «' \+ title \+ '»',/u);
      assert.match(source, /proofAria: 'Чем закреплено: механизм «' \+ title \+ '»',/u);
      assert.match(source, />Обсудить это направление</u);
      assert.match(source, /<span>Чем закреплено<\/span>/u);
    }
  });
});
