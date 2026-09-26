/**
 * Доводка общих частей кабинета по аудиту доступности (решение Р-253).
 *
 * Проверка идёт по исходникам, как в `cabinet-markup.test.ts`: снимок
 * показывает только то, что попало в обход, а большая часть найденного —
 * фокус скрытого поля, свёртка длинной таблицы, экран «не найдено»,
 * кнопка сбоя — в обход не попадает вовсе. Каждое правило запирает одну
 * находку, и в имени проверки она названа.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  BUTTON_BASE,
  CABINET_CSS,
  FIELD_CONTROL,
  ROOT_TOKENS,
} from '../src/components/cabinet/tokens.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const SCREENS = path.join(SRC, 'app', 'cabinet');
const COMPONENTS = path.join(SRC, 'components', 'cabinet');

function read(...parts: string[]): string {
  return readFileSync(path.join(...parts), 'utf8');
}

function sources(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.tsx') || name.endsWith('.ts'))
    .map((name) => path.join(root, name));
}

/** Исходник без комментариев: правила касаются кода, а не пояснений к нему. */
function code(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/gu, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

/** Тело функции-компонента: от объявления до следующего объявления верхнего уровня. */
function component(text: string, name: string): string {
  const start = text.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `компонент ${name} не найден`);
  const next = text.slice(start + 1).search(/\n(?:export )?(?:async )?function /u);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/** Контраст двух цветов по WCAG 2.x. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function token(name: string): string {
  const value = new RegExp(`--pd-${name}:(#[0-9A-F]{6})`, 'iu').exec(ROOT_TOKENS)?.[1];
  assert.ok(value !== undefined, `токена --pd-${name} нет`);
  return value;
}

describe('1. фокус скрытого поля выбора файла виден', () => {
  const pick = read(COMPONENTS, 'FilePick.tsx');

  it('поле помечено классом, метка стоит сразу за ним', () => {
    const body = code(pick);
    assert.match(body, /type="file"[\s\S]*?className="cab-file"/u);
    // Правило держится на соседстве `input + label`: узел между ними,
    // даже пустой span, сделал бы фокус снова невидимым.
    assert.match(body, /className="cab-file"[\s\S]*?\/>\s*<label\b/u);
  });

  it('правило фокуса объявлено в общих стилях', () => {
    assert.match(CABINET_CSS, /\.cab-file:focus-visible\+label\{outline:2px solid var\(--pd-accent\);outline-offset:2px\}/u);
  });

  it('метка несёт классы общей кнопки', () => {
    assert.match(code(pick), /<label[^>]*className="cab-btn cab-btn-quiet"/u);
  });
});

describe('2. ссылка в подписи согласия подчёркнута', () => {
  it('правило подчёркивания касается и подписей, не только абзацев', () => {
    assert.match(CABINET_CSS, /:is\(p,label\) a\{text-decoration:underline;text-underline-offset:3px/u);
  });

  it('ссылки согласия стоят в подписи флажка', () => {
    // `Checkbox` оборачивает подпись в `<label>` — на этом держится правило.
    assert.match(component(read(COMPONENTS, 'ui.tsx'), 'Checkbox'), /<label\b/u);
    const request = read(SCREENS, 'request', 'page.tsx');
    for (const href of ['/consent', '/offer', '/privacy']) {
      assert.ok(request.includes(`<a href="${href}"`), `ссылки ${href} в подписи нет`);
    }
    assert.equal(/textDecoration:\s*'none'/u.test(request), false, 'подчёркивание снято на экране');
  });
});

describe('3. кольцо не ужимается мельче своего поля', () => {
  // Поле кольца — 260 px; в рамке уже подписи в 12 px выходили ниже
  // нижней ступени кегля.
  const field = Number(/const W = (\d+);/u.exec(component(read(COMPONENTS, 'Charts.tsx'), 'DonutChart'))?.[1]);

  it('поле кольца известно', () => {
    assert.equal(field, 260);
  });

  for (const file of sources(SCREENS).filter((f) => read(f).includes('<DonutChart'))) {
    it(path.relative(SCREENS, file), () => {
      const frames = [...code(read(file)).matchAll(/width: (\d+)[^}]*\}\}>\s*<DonutChart/gu)];
      for (const m of frames) {
        assert.ok(Number(m[1]) >= field, `рамка кольца ${m[1]} px уже поля ${field}`);
      }
    });
  }

  it('manage/finance/page.tsx: рамка 260', () => {
    assert.match(read(SCREENS, 'manage', 'finance', 'page.tsx'), /width: 260, flex: '0 0 auto' \}\}>\s*<DonutChart/u);
  });
});

describe('4. остаток длинной таблицы прокручивается внутри себя', () => {
  it('таблица под свёрткой обёрнута в TableScroll', () => {
    const table = code(component(read(COMPONENTS, 'ui.tsx'), 'LongTable'));
    const fold = table.slice(table.indexOf('<Disclosure'));
    assert.match(fold, /<TableScroll\b[^>]*>\s*<table\b/u, 'вторая таблица стоит в свёртке голой');
  });
});

describe('5. поле ссылки входа — общего облика', () => {
  const access = code(read(COMPONENTS, 'AccessLink.tsx'));

  it('кегль поля не меньше 16 px', () => {
    assert.equal(/fontSize:\s*1[0-5]\b[^}]*\}\}\s*\/>/u.test(access), false);
    assert.match(access, /const control = FIELD_CONTROL;/u);
    assert.equal(FIELD_CONTROL.fontSize, 16);
  });

  it('рамка поля не своя', () => {
    assert.equal(/border:\s*'1px solid var\(--pd-border\)'/u.test(access), false);
  });
});

describe('6. состояние загрузки не выводится цветом исхода', () => {
  it('manage/import/[batchId]/page.tsx: зафиксированная загрузка — спокойным текстом', () => {
    const page = code(read(SCREENS, 'manage', 'import', '[batchId]', 'page.tsx'));
    assert.match(page, /\{applied \? \(\s*<Text muted>/u);
  });
});

describe('7. выходы экрана «не найдено» — кнопки', () => {
  it('not-found.tsx: две общие кнопки-ссылки, а не строка ссылок', () => {
    const page = code(read(SCREENS, 'not-found.tsx'));
    assert.equal((page.match(/<ButtonLink\b/gu) ?? []).length, 2);
    assert.equal(/<a\b/u.test(page), false);
  });
});

describe('8. призыв к действию на плашке работы — цель в 44 px', () => {
  it('projects/page.tsx: ссылка на ждущий этап — cab-mark', () => {
    const page = code(read(SCREENS, 'projects', 'page.tsx'));
    assert.match(page, /<a className="cab-mark" href=\{`\/cabinet\/stages\/\$\{waiting\.id\}`\}>/u);
  });

  it('cab-mark даёт высоту 44 px', () => {
    assert.match(CABINET_CSS, /\.cab-mark\{[^}]*min-height:44px/u);
  });
});

describe('9. рамка поля ввода различима', () => {
  const edge = token('field-edge');

  it('контраст рамки не ниже 3:1 к белому, тихой поверхности и акцентной подложке', () => {
    for (const name of ['ink-inverse', 'surface-quiet', 'accent-tint']) {
      const ratio = contrast(edge, token(name));
      assert.ok(ratio >= 3, `рамка ${edge} к --pd-${name}: ${ratio.toFixed(2)}:1`);
    }
  });

  it('рамка не светлее #8A93A3', () => {
    assert.ok(contrast(edge, '#FFFFFF') >= contrast('#8A93A3', '#FFFFFF'));
  });

  it('общий вид поля берёт рамку из токена поля', () => {
    assert.equal(FIELD_CONTROL.border, '1px solid var(--pd-field-edge)');
  });

  it('кромка сайта не переопределена', () => {
    assert.equal(token('edge-neutral'), '#C4CAD4');
  });

  for (const name of ['Field', 'Select']) {
    it(`${name} собран на FIELD_CONTROL`, () => {
      const body = code(component(read(COMPONENTS, 'ui.tsx'), name));
      assert.match(body, /FIELD_CONTROL/u);
      assert.equal(/edge-neutral/u.test(body), false);
    });
  }

  it('рамка поля в фокусе перекрывает встроенный стиль', () => {
    assert.match(CABINET_CSS, /input:focus,textarea:focus,select:focus\{[^}]*border-color:var\(--pd-accent\)!important/u);
  });
});

describe('10. плашка раздела нажимается целиком', () => {
  it('manage/tools/page.tsx: ссылка названия растянута на плашку', () => {
    const page = code(read(SCREENS, 'manage', 'tools', 'page.tsx'));
    assert.match(page, /<a className="cab-stretch" href=\{tool\.href\}>/u);
  });
});

describe('11. стрелок-символов в подписях нет', () => {
  // Знаки в кабинете штриховые; стрелка текстом — символ-украшение
  // (решение Р-165). Комментарии не в счёт: их никто не видит.
  for (const file of [...sources(SCREENS), ...sources(COMPONENTS)]) {
    it(path.relative(SRC, file), () => {
      assert.equal(/[←-⇿☀-➿]/u.test(code(read(file))), false);
    });
  }

  it('manage/import/[batchId]/page.tsx: сведение названо словами', () => {
    assert.match(read(SCREENS, 'manage', 'import', '[batchId]', 'page.tsx'), /`Свести «\$\{source\.fullName\}»/u);
  });
});

describe('12. плавная прокрутка сайта в кабинете снята', () => {
  it('общие стили возвращают обычную прокрутку', () => {
    assert.match(CABINET_CSS, /(?:^|\n)(?::root|html(?::root)?)\{scroll-behavior:auto\}/u);
  });
});

describe('13. кнопки несут класс общей кнопки', () => {
  it('на экранах нет собственных <button>', () => {
    const guilty = sources(SCREENS)
      .filter((file) => /<button\b/u.test(code(read(file))))
      .map((file) => path.relative(SCREENS, file));
    assert.deepEqual(guilty, []);
  });

  it('каждая <button> в общих частях — с классом cab-btn', () => {
    for (const file of sources(COMPONENTS)) {
      for (const m of code(read(file)).matchAll(/<button\b([\s\S]*?)>/gu)) {
        assert.match(m[1]!, /className=\{?[`'"]cab-btn/u, `${path.basename(file)}: кнопка без общего класса`);
      }
    }
  });

  it('всё, что одето кнопкой, откликается как кнопка', () => {
    // Вид кнопки встроенным стилем без класса не отзывается ни на
    // наведение, ни на нажатие.
    for (const file of sources(COMPONENTS)) {
      const text = code(read(file));
      for (const m of text.matchAll(/\.\.\.BUTTON_(?:PRIMARY|QUIET|CHIP)\b/gu)) {
        const open = text.lastIndexOf('<', m.index);
        assert.match(text.slice(open, m.index), /className=\{?[`'"]cab-btn/u, `${path.basename(file)}: вид кнопки без класса`);
      }
    }
  });

  it('error.tsx: общая кнопка, начертание 600', () => {
    const page = code(read(SCREENS, 'error.tsx'));
    assert.match(page, /<Button type="button" onClick=\{reset\}>/u);
    assert.equal(/<button\b/u.test(page), false);
    // Начертание кнопки берётся у общей части, а не с экрана.
    assert.equal(BUTTON_BASE.fontWeight, 600);
  });

  it('состояния кнопки перекрывают встроенный стиль', () => {
    assert.match(CABINET_CSS, /\.cab-btn-primary:hover,\.cab-btn-primary:focus-visible\{background:var\(--pd-accent-hover\)!important\}/u);
    assert.match(CABINET_CSS, /\.cab-btn-quiet:hover,\.cab-btn-quiet:focus-visible\{border-color:var\(--pd-accent\)!important;color:var\(--pd-accent\)!important\}/u);
  });
});

describe('14. блок исхода действия помечен и в счёт блоков не входит', () => {
  const ui = read(COMPONENTS, 'ui.tsx');

  it('Outcome ставит признак исхода', () => {
    assert.match(component(ui, 'Outcome'), /className="cab-outcome"/u);
  });

  it('Notice зелёного и красного тона помечен исходом, спокойный — нет', () => {
    assert.match(component(ui, 'Notice'), /className=\{tone === 'quiet' \? undefined : 'cab-outcome'\}/u);
  });

  it('ActionError собран на Outcome', () => {
    const body = code(read(COMPONENTS, 'ActionError.tsx'));
    assert.match(body, /<Outcome tone="error">/u);
    assert.equal(/<div\b/u.test(body), false);
  });

  it('экраны не оборачивают исход в безымянный div', () => {
    const guilty = sources(SCREENS)
      .filter((file) =>
        /<div style=\{\{[^}]*\}\}>\s*<Notice(?! tone="quiet")\b/u.test(code(read(file))),
      )
      .map((file) => path.relative(SCREENS, file));
    assert.deepEqual(guilty, []);
  });

  it('правило общих частей пропускает помеченный исход', () => {
    const view = read(import.meta.dirname, 'cabinet-view.test.ts');
    assert.match(view, /cab-block\|cab-head\|cab-filter\|cab-outcome/u);
  });
});

describe('подвал кабинета без реквизитов', () => {
  it('Shell.tsx: описание каркаса не обещает реквизитов в подвале', () => {
    assert.equal(/подвал\s+(?:\*\s+)?с\s+(?:\*\s+)?реквизитами/u.test(read(COMPONENTS, 'Shell.tsx')), false);
  });

  it('Shell.tsx: в подвале нет ИНН и ОГРН', () => {
    const footer = read(COMPONENTS, 'Shell.tsx').split('<footer')[1] ?? '';
    assert.equal(/ИНН|ОГРН|КПП/u.test(code(footer)), false);
  });
});
