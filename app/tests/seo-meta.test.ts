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
