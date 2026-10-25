/**
 * Графики по месяцам на телефоне открываются на последнем месяце (решение
 * Р-753). Где рисунок шире области (Р-209), область прокрутки открыта у
 * правого края: она — справа налево, рисунок внутри — слева направо;
 * сценария нет, порядок разметки, фокус и имя области прежние (Р-168).
 * Где рисунок входит целиком (1440 px), вид не меняется. Сезонная норма
 * (январь — декабрь) и недельный расход рекламы — как прежде, с начала.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const SRC = path.join(import.meta.dirname, '..', 'src');
const read = (...parts: string[]) => readFileSync(path.join(SRC, ...parts), 'utf8');
const charts = read('components', 'cabinet', 'Charts.tsx');

describe('графики по месяцам открываются на последнем месяце (Р-753)', () => {
  it('область — справа налево, рисунок — слева направо; фокус и имя прежние', () => {
    const frame = charts.slice(charts.indexOf('function Frame('), charts.indexOf('/** Маркер ряда в легенде.'));
    assert.match(frame, /role="region"\s*aria-label=\{title\}\s*tabIndex=\{0\}/u);
    assert.match(frame, /style=\{\{ overflowX: 'auto', \.\.\.\(latest \? \{ direction: 'rtl' as const \} : \{\}\) \}\}/u);
    assert.match(frame, /<div style=\{\{ minWidth: width, \.\.\.\(latest \? \{ direction: 'ltr' as const \} : \{\}\) \}\}>\{children\}<\/div>/u);
    assert.doesNotMatch(frame, /useEffect|scrollLeft/u);
  });

  it('столбцы и линии передают признак рамке', () => {
    assert.equal([...charts.matchAll(/<Frame width=\{W\} title=\{title\} latest=\{latest\}>/gu)].length, 2);
  });

  const MONTHLY: [string[], string][] = [
    [['app', 'cabinet', 'manage', 'page.tsx'], 'Принято заказов по месяцам'],
    [['app', 'cabinet', 'manage', 'page.tsx'], 'Поступления по месяцу оплаты'],
    [['app', 'cabinet', 'manage', 'finance', 'page.tsx'], 'Оплаты по месяцу начала работы'],
    [['app', 'cabinet', 'manage', 'analytics', 'page.tsx'], 'Законтрактовано по месяцам'],
    [['app', 'cabinet', 'manage', 'analytics', 'page.tsx'], 'Заявки по месяцам'],
    [['app', 'cabinet', 'manage', 'analytics', 'money', 'page.tsx'], 'Договоры и оплаты по месяцу начала работы'],
  ];
  for (const [file, title] of MONTHLY) {
    it(`«${title}» — с последнего месяца`, () => {
      const source = read(...file);
      const at = source.search(new RegExp(`<(?:BarChart|LineChart)\\s+title="${title}"`, 'u'));
      assert.ok(at > 0, `нет графика «${title}»`);
      assert.match(source.slice(at, at + 200), new RegExp(`title="${title}"\\s+latest\\s`, 'u'));
    });
  }

  it('сезонная норма и недельный расход — с начала, как прежде', () => {
    const money = read('app', 'cabinet', 'manage', 'analytics', 'money', 'page.tsx');
    const season = money.search(/<BarChart\s+title="Сезонная норма заказов"/u);
    assert.doesNotMatch(money.slice(season, season + 200), /\slatest\s/u);
    const ads = read('app', 'cabinet', 'manage', 'ads', 'page.tsx');
    const weeks = ads.search(/<BarChart\s+title="Расход по неделям/u);
    assert.doesNotMatch(ads.slice(weeks, weeks + 200), /\slatest\s/u);
  });
});

