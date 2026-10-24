/**
 * «Отчёт за период» открывается за период «Пульса», вкладки отчёта названы
 * по содержанию (решение Р-759). Прежде кнопка на «Сводке» вела на
 * отчёт без периода — за 30 дней, — пока «Пульс» по умолчанию считал
 * 90 дней: руководитель сравнивал «Получено 230 000 ₽» «Пульса» с
 * «130 000 ₽» отчёта за «тот же» период. Вкладки «Месяц / Квартал / Год»
 * читались как календарные, а это последние 30, 90 и 365 дней. Счёт
 * периода прежний (Р-236, Р-448), периоды «Пульса» прежние (Р-585).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { periodBounds } from '../src/lib/cabinet/analytics/metrics.ts';
import { PULSE_DEFAULT, PULSE_PERIODS, pulseWindow } from '../src/lib/cabinet/analytics/pulse.ts';

const APP = path.join(import.meta.dirname, '..', 'src', 'app', 'cabinet', 'manage');
const summary = readFileSync(path.join(APP, 'page.tsx'), 'utf8');
const report = readFileSync(path.join(APP, 'report', 'page.tsx'), 'utf8');

/** Вкладки отчёта: ключ в адресе, подпись, число дней. */
const periods = [...report.matchAll(/key: "(\w+)",\s*label: "([^"]+)",\s*days: (\d+),/gu)].map((match) => ({
  key: match[1]!,
  label: match[2]!,
  days: Number(match[3]),
}));

describe('«Отчёт за период» — за период «Пульса» (Р-759)', () => {
  it('кнопка передаёт период: 90 дней «Пульса» — 90 дней отчёта, остальные — 30', () => {
    assert.match(
      summary,
      /<ButtonLink href=\{`\/cabinet\/manage\/report\?period=\$\{period === '90' \? 'quarter' : 'month'\}`\}>\s*Отчёт за период\s*<\/ButtonLink>/u,
    );
    assert.doesNotMatch(summary, /<ButtonLink href="\/cabinet\/manage\/report">/u);
    // `period` кнопки — тот же, что у «Пульса».
    assert.match(summary, /const period = pulsePeriod\(\(await searchParams\)\.period\);/u);
  });

  it('ключи кнопки есть среди вкладок отчёта и дают те же дни, что «Пульс»', () => {
    const byKey = new Map(periods.map((item) => [item.key, item.days]));
    assert.equal(byKey.get('quarter'), 90);
    assert.equal(byKey.get('month'), 30);
    // «Пульс» по умолчанию — 90 дней; у отчёта по умолчанию — первая вкладка.
    assert.equal(PULSE_DEFAULT, '90');
    assert.deepEqual(PULSE_PERIODS.map((item) => item.key), ['7', '28', 'month', '90']);
    assert.match(report, /const period = PERIODS\.find\(\(item\) => item\.key === asked\) \?\? PERIODS\[0\];/u);
  });

  it('90 дней «Пульса» и 90 дней отчёта — один и тот же отрезок московских дней (Р-448)', () => {
    for (const iso of ['2026-09-23', '2026-03-01', '2026-12-31']) {
      const today = new Date(`${iso}T00:00:00Z`);
      const pulse = pulseWindow('90', today).current;
      const own = periodBounds(today, 90);
      assert.equal(pulse.from.toISOString(), own.from.toISOString(), iso);
      assert.equal(pulse.to.toISOString(), own.to.toISOString(), iso);
    }
    assert.match(report, /const \{ from, to \} = periodBounds\(moscowToday\(today\), period\.days\);/u);
  });
});

describe('вкладки отчёта названы по содержанию (Р-759)', () => {
  it('«30 дней / 90 дней / 12 месяцев», дни прежние', () => {
    assert.deepEqual(periods, [
      { key: 'month', label: '30 дней', days: 30 },
      { key: 'quarter', label: '90 дней', days: 90 },
      { key: 'year', label: '12 месяцев', days: 365 },
    ]);
  });

  it('слов «Месяц» и «Квартал» во вкладках нет', () => {
    for (const { label } of periods) assert.doesNotMatch(label, /Месяц|Квартал|Год/u, label);
  });

  it('периоды «Пульса» не менялись (Р-585)', () => {
    assert.deepEqual(
      PULSE_PERIODS.map((item) => item.label),
      ['7 дней', '28 дней', 'Текущий месяц', '90 дней'],
    );
  });
});
