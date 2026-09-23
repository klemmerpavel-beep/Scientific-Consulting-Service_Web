/**
 * Облик кабинета после аудита 23.09.2026 (решения Р-204 — Р-209).
 *
 * Каждое правило здесь закрывает найденный дефект, который прежние
 * проверки пропускали по устройству: снимки без гарнитур сайта, красная
 * шкала под другим именем, бесконечное движение, клиентская подпись у
 * служебных ролей, экран без ответа на свой вопрос, день съёмки в числах.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { CABINET_CSS, ROOT_TOKENS } from '../src/components/cabinet/tokens.ts';
import { daysPast, now } from '../src/lib/cabinet/clock.ts';
import { SOURCE_FILE, sourceHash } from '../scripts/cabinet-source.mjs';
import {
  STAGE_STATE_LABEL,
  STAGE_STATE_LABEL_STAFF,
  stageLabel,
  stageStateLabel,
} from '../src/lib/cabinet/stage-state.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const PROTOTYPE = path.join(ROOT, 'design', 'cabinet-prototype');
const ARTBOARDS = path.join(ROOT, 'design', 'cabinet');
const SCREENS = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet');

function body(file: string): string {
  return readFileSync(file, 'utf8').replace(/<div class="pt-bar">[\s\S]*?<\/div>/u, '');
}

function screens(folder: string): string[] {
  const root = path.join(PROTOTYPE, folder);
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.html'))
    .map((name) => path.join(root, name));
}

describe('снимки набраны гарнитурами сайта', () => {
  // Прежде `@font-face` из снимков вырезались, и заказчик принимал облик
  // в Georgia и Arial (решение Р-204).
  const css = readFileSync(path.join(PROTOTYPE, 'prototype.css'), 'utf8');

  for (const family of ['Literata', 'Inter', 'JetBrains Mono']) {
    it(`прототип: ${family} объявлена файлом рядом`, () => {
      const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/gu)]
        .map((m) => m[0])
        .filter((face) => new RegExp(`font-family:${family}[;,]`, 'u').test(face));
      assert.ok(faces.some((face) => face.includes('url(')), `гарнитура ${family} не встроена`);
      for (const face of faces) {
        const file = /url\(([^)]+)\)/u.exec(face)?.[1];
        if (file === undefined) continue;
        assert.ok(!file.includes('_next'), `правило ведёт на файл сборки: ${file}`);
        assert.ok(existsSync(path.join(PROTOTYPE, file)), `файла шрифта нет: ${file}`);
      }
    });
  }

  it('артборды ссылаются на существующие файлы шрифтов', () => {
    const boards = readdirSync(ARTBOARDS).filter((name) => name.endsWith('.dc.html'));
    assert.equal(boards.length, 13);
    for (const board of boards) {
      const html = readFileSync(path.join(ARTBOARDS, board), 'utf8');
      const files = [...html.matchAll(/url\((fonts\/[^)]+\.woff2)\)/gu)].map((m) => m[1]!);
      assert.ok(files.length > 0, `${board}: гарнитуры не встроены`);
      for (const file of files) assert.ok(existsSync(path.join(ARTBOARDS, file)), `${board}: нет ${file}`);
    }
  });
});

describe('красный — только исход действия, и под другим именем тоже', () => {
  // Шкала `--pd-alert-*` побайтно повторяла фон и текст блока ошибки
  // (решение Р-208). Возвращать её под любым именем нельзя.
  it('в токенах кабинета нет шкалы тревоги', () => {
    assert.equal(/--pd-alert-/u.test(ROOT_TOKENS), false);
  });

  it('значения пары ошибки не объявлены вторым токеном', () => {
    const declared = [...ROOT_TOKENS.matchAll(/(--pd-[a-z0-9-]+):(#[0-9A-F]{6})/giu)];
    const err = declared.filter(([, name]) => name!.startsWith('--pd-err-')).map(([, , v]) => v);
    const twins = declared.filter(
      ([, name, value]) => !name!.startsWith('--pd-err-') && err.includes(value),
    );
    assert.deepEqual(twins.map(([, name]) => name), []);
  });

  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(`${path.relative(PROTOTYPE, file)}: шкала тревоги не применена`, () => {
        assert.equal(/var\(--pd-alert-/u.test(body(file)), false);
      });
    }
  }
});

describe('движение — появление и отклик, 180—260 мс', () => {
  // Покачивание волны 3,2 с и пульс заготовки 1,4 с шли бесконечно
  // (решение Р-209).
  it('в общих правилах нет бесконечной анимации', () => {
    assert.equal(/infinite/u.test(CABINET_CSS), false);
  });

  it('длительности переходов и анимаций в шкале', () => {
    for (const m of CABINET_CSS.matchAll(/(\d+)ms/gu)) {
      const ms = Number(m[1]);
      assert.ok(ms >= 180 && ms <= 260, `длительность вне шкалы: ${ms} мс`);
    }
  });
});

describe('состояние этапа названо со стороны смотрящего', () => {
  // «Ждём ваших данных» у эксперта читалось как задание ему (решение Р-206).
  it('клиенту — его подпись, практике — чей ход', () => {
    assert.equal(stageLabel('AWAITING_CLIENT', false), STAGE_STATE_LABEL.AWAITING_CLIENT);
    assert.equal(stageLabel('AWAITING_CLIENT', true), STAGE_STATE_LABEL_STAFF.AWAITING_CLIENT);
    assert.notEqual(STAGE_STATE_LABEL_STAFF.AWAITING_CLIENT, STAGE_STATE_LABEL.AWAITING_CLIENT);
    assert.equal(stageStateLabel('AWAITING_CLIENT'), STAGE_STATE_LABEL_STAFF.AWAITING_CLIENT);
  });

  for (const folder of ['expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      it(`${path.relative(PROTOTYPE, file)}: клиентская подпись не показана практике`, () => {
        const text = body(file).replace(/<[^>]+>/gu, ' ');
        assert.equal(/Ждём ваших данных|Сейчас от вас ничего не требуется/u.test(text), false);
      });
    }
  }
});

describe('начальный экран роли отвечает на свой вопрос', () => {
  // Ответ стоит первым, акцентной панелью (решение Р-207).
  const homes = [
    'client/projects/index.html',
    'expert/projects/index.html',
    'manager/manage/index.html',
    'head/manage/index.html',
  ];
  for (const home of homes) {
    it(home, () => {
      const main = body(path.join(PROTOTYPE, home)).match(/<main\b[^>]*>([\s\S]*)<\/main>/u)?.[1] ?? '';
      const first = main.match(/^<div class="([^"]*)"/u)?.[1] ?? '';
      assert.ok(first.includes('cab-answer'), 'экран начинается не с ответа');
      assert.equal((main.match(/cab-answer/gu) ?? []).length, 1, 'тёмная панель на экране не одна');
    });
  }
});

describe('день — у часов кабинета', () => {
  // Экраны считали просрочку от настоящего «сейчас», а наполнение снимков —
  // от постоянной точки: снимок менялся ото дня ко дню (решение Р-205).
  it('CABINET_NOW задаёт день при базе снимков', () => {
    const before = process.env.CABINET_NOW;
    const base = process.env.DATABASE_URL;
    process.env.CABINET_NOW = '2026-09-16T09:00:00.000Z';
    process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5433/prodisser_artboards';
    try {
      assert.equal(now().toISOString(), '2026-09-16T09:00:00.000Z');
      assert.equal(daysPast(new Date('2026-09-06T09:00:00Z')), 10);
      assert.equal(daysPast(new Date('2026-09-20T09:00:00Z')), null);
      assert.equal(daysPast(null), null);
    } finally {
      if (before === undefined) delete process.env.CABINET_NOW;
      else process.env.CABINET_NOW = before;
      if (base === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = base;
    }
  });

  it('на рабочей базе CABINET_NOW не действует', () => {
    // Остановленные часы на боевой базе заморозили бы все просрочки
    // (решение Р-214).
    const before = process.env.CABINET_NOW;
    const base = process.env.DATABASE_URL;
    process.env.CABINET_NOW = '2020-01-01T00:00:00.000Z';
    process.env.DATABASE_URL = 'postgresql://app@db:5432/prodisser';
    try {
      assert.ok(Math.abs(now().getTime() - Date.now()) < 1000);
    } finally {
      if (before === undefined) delete process.env.CABINET_NOW;
      else process.env.CABINET_NOW = before;
      if (base === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = base;
    }
  });

  it('без переменной часы настоящие', () => {
    const before = process.env.CABINET_NOW;
    delete process.env.CABINET_NOW;
    try {
      assert.ok(Math.abs(now().getTime() - Date.now()) < 1000);
    } finally {
      if (before !== undefined) process.env.CABINET_NOW = before;
    }
  });

  it('страницы кабинета не берут день у Date.now()', () => {
    const guilty = readdirSync(SCREENS, { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('page.tsx'))
      .filter((name) => /Date\.now\(\)|new Date\(\)/u.test(readFileSync(path.join(SCREENS, name), 'utf8')));
    assert.deepEqual(guilty, []);
  });
});

describe('снимок не старше кода', () => {
  // Снимки уже однажды отстали от экранов, и правила облика читали
  // устаревшую разметку (решения Р-203, Р-214).
  const current = sourceHash();
  for (const dir of [PROTOTYPE, ARTBOARDS]) {
    it(path.relative(ROOT, dir), () => {
      const file = path.join(dir, SOURCE_FILE);
      assert.ok(existsSync(file), 'у снимка нет отпечатка исходников — пересоберите его');
      const recorded = readFileSync(file, 'utf8').split('\n')[0];
      assert.equal(
        recorded,
        current,
        'исходники кабинета изменились после съёмки: node tools/cabinet-artboards.mjs, затем node tools/cabinet-prototype.mjs',
      );
    });
  }
});

describe('ответ помещается в первый экран', () => {
  // Название этапа в ответе не ограничивалось, и длинное выталкивало ответ
  // за нижний край телефона (решение Р-210).
  for (const folder of ['client', 'expert', 'manager', 'head']) {
    for (const file of screens(folder)) {
      const html = body(file);
      if (!html.includes('cab-answer')) continue;
      it(`${path.relative(PROTOTYPE, file)}: фраза ответа не длиннее 90 знаков`, () => {
        const panel = html.slice(html.indexOf('cab-answer'));
        const lead = /<\/h1>[\s\S]*?<p\b[^>]*>([\s\S]*?)<\/p>/u.exec(panel)?.[1] ?? '';
        const text = lead.replace(/<[^>]+>/gu, '').replace(/&[a-z]+;/gu, ' ').trim();
        assert.ok(text.length > 0, 'фраза ответа не найдена');
        assert.ok(text.length <= 90, `фраза ответа ${text.length} знаков: ${text}`);
      });
    }
  }
});
