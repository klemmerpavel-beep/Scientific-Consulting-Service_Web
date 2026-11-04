/**
 * «План от даты защиты» на «Аспирантам» (Р-804).
 *
 * Посетитель выбирает дату защиты и вид диссертации, страница отсчитывает
 * назад сроки Положения о присуждении учёных степеней (постановление
 * Правительства РФ от 24.09.2013 № 842). Охраняется:
 *
 * - перечень сроков: только сроки с пунктом Положения, ровно как в NORM.
 *   Новый срок на странице без пункта и без правки этого перечня роняет тест:
 *   срок попадает в план только после сверки с текстом документа;
 * - счёт дат: календарные числа без часового пояса, месяц назад — то же
 *   число или последний день месяца (31-е, февраль, високосный год),
 *   «сегодня» — по Москве;
 * - границы блока: формы нет, обработчики не submit* (перенос обернул бы их
 *   в отправку заявки), сетевых вызовов и хранилищ нет; действие — ссылка
 *   на существующую форму #request (Р-96); блок стоит сразу за «Порядком
 *   работы»; тексты проходят text-guard.
 *
 * Логика живёт в макете и переносится в компонент дословно, поэтому
 * выполняется сам сценарий макета с заглушкой DCLogic.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findForbidden } from '../src/lib/cabinet/text-guard.ts';

const ROOT = path.join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (s: string) => s.replace(/ |&nbsp;/gu, ' ');

const html = read('design/MainPage.dc.html');
const tsx = read('app/src/components/pages/PostgradPage.tsx');
const script = html.match(/<script[^>]*data-dc-script[^>]*>([\s\S]*?)<\/script>/u)![1]!;

class DCLogic {
  state: any = {};
  setState(u: any) {
    const patch = typeof u === 'function' ? u(this.state) : u;
    this.state = { ...this.state, ...patch };
  }
}
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const Component = new Function('DCLogic', `${script}\nreturn Component;`)(DCLogic);
const c: any = new Component();

/**
 * Сроки, сверенные с Положением: пункт, отсчёт для кандидатской и докторской.
 * Дни — календарные (Положение не называет их рабочими).
 * п. 26 — объявление о защите и автореферат на сайте ВАК: «не позднее чем
 *   за 3 месяца» (доктор наук), «не позднее чем за 2 месяца» (кандидат наук);
 * п. 25 — рассылка автореферата: «не позднее чем за 1 месяц»;
 * пп. 23, 24 — оригиналы отзывов оппонентов и ведущей организации в совете
 *   «не позднее чем за 15 дней», копии соискателю — «не позднее чем за 10 дней».
 */
const NORM = [
  { point: 'п. 26', back: [{ months: 2 }, { months: 3 }], title: /Объявление о защите и автореферат на сайте ВАК/u },
  { point: 'п. 25', back: [{ months: 1 }, { months: 1 }], title: /Рассылка автореферата/u },
  { point: 'пп. 23 и 24', back: [{ days: 15 }, { days: 15 }], title: /Отзывы оппонентов и ведущей организации/u },
  { point: 'пп. 23 и 24', back: [{ days: 10 }, { days: 10 }], title: /Копии отзывов/u },
] as const;

const section = (() => {
  const at = html.indexOf('<section id="defense-plan"');
  assert.ok(at > 0, 'на странице нет раздела #defense-plan');
  return html.slice(at, html.indexOf('</section>', at) + '</section>'.length);
})();

const plan = (date: string, kind = 0, today = '2000-01-01') =>
  (c.dpPlan(date, kind, today) as Array<Record<string, any>>);
const isoOf = (date: string, kind = 0) => plan(date, kind).map((r) => r.iso);

describe('План от даты защиты: сроки только из Положения (Р-804)', () => {
  it('в плане ровно сверенные сроки, у каждого — пункт Положения', () => {
    const rules = c.dpRules() as Array<Record<string, any>>;
    const dated = rules.filter((r) => r.back && !r.day);
    assert.equal(dated.length, NORM.length, 'срок без сверки с Положением: добавьте его в NORM с пунктом и цитатой');
    dated.forEach((r, i) => {
      assert.equal(plain(r.point), NORM[i]!.point, `${plain(r.title)}: пункт`);
      assert.deepEqual(r.back, NORM[i]!.back, `${plain(r.title)}: отсчёт`);
      assert.match(plain(r.title), NORM[i]!.title);
    });
  });

  it('шаги без срока в Положении — без даты и без пункта', () => {
    const rules = c.dpRules() as Array<Record<string, any>>;
    for (const r of rules.filter((x) => !x.back)) {
      assert.equal(r.free, true, `${plain(r.title)}: шаг без отсчёта должен быть отмечен free`);
      assert.equal(r.point, undefined, `${plain(r.title)}: у шага без срока нет пункта`);
    }
    const free = plan('2027-03-31').filter((r) => r.kind === 'free');
    assert.ok(free.length > 0);
    for (const r of free) {
      assert.equal(r.iso, '', 'шаг без срока получил дату');
      assert.equal(plain(r.rule), 'Срок Положением не задан');
    }
  });

  it('последняя точка — день защиты, разница кандидатской и докторской — только в п. 26', () => {
    const last = plan('2027-03-31').at(-1)!;
    assert.equal(last.kind, 'day');
    assert.equal(last.iso, '2027-03-31');
    const cand = isoOf('2027-03-31', 0);
    const doct = isoOf('2027-03-31', 1);
    const differ = cand.map((v, i) => (v !== doct[i] ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(differ.map((i) => plain(plan('2027-03-31')[i]!.cite)), ['п. 26 Положения']);
  });

  it('подписи срока и пункта — по данным', () => {
    const rows = plan('2027-03-31', 1).filter((r) => r.kind === 'rule');
    assert.deepEqual(rows.map((r) => plain(r.rule)), [
      'Не позднее чем за 3 месяца', 'Не позднее чем за 1 месяц', 'Не позднее чем за 15 дней', 'Не позднее чем за 10 дней',
    ]);
    assert.deepEqual(rows.map((r) => plain(r.cite)), ['п. 26 Положения', 'п. 25 Положения', 'пп. 23 и 24 Положения', 'пп. 23 и 24 Положения']);
  });
});

describe('счёт дат: границы месяцев, 31-е числа, високосный год', () => {
  // [дата защиты, вид, ожидаемые даты п. 26, п. 25, 15 дней, 10 дней]
  const CASES: Array<[string, number, string[]]> = [
    ['2027-03-31', 0, ['2027-01-31', '2027-02-28', '2027-03-16', '2027-03-21']],
    ['2027-03-31', 1, ['2026-12-31', '2027-02-28', '2027-03-16', '2027-03-21']],
    ['2028-03-31', 0, ['2028-01-31', '2028-02-29', '2028-03-16', '2028-03-21']],
    ['2028-03-10', 0, ['2028-01-10', '2028-02-10', '2028-02-24', '2028-02-29']],
    ['2027-05-31', 1, ['2027-02-28', '2027-04-30', '2027-05-16', '2027-05-21']],
    ['2027-12-31', 0, ['2027-10-31', '2027-11-30', '2027-12-16', '2027-12-21']],
    ['2027-01-05', 1, ['2026-10-05', '2026-12-05', '2026-12-21', '2026-12-26']],
    ['2029-03-01', 0, ['2029-01-01', '2029-02-01', '2029-02-14', '2029-02-19']],
    ['2100-03-31', 0, ['2100-01-31', '2100-02-28', '2100-03-16', '2100-03-21']],
  ];
  for (const [date, kind, want] of CASES) {
    it(`${date}, ${kind ? 'докторская' : 'кандидатская'}`, () => {
      const got = plan(date, kind).filter((r) => r.kind === 'rule').map((r) => r.iso);
      assert.deepEqual(got, want);
    });
  }

  it('дата с числом, которого нет, и пустое поле — плана с датами нет', () => {
    for (const bad of ['2027-02-29', '2027-02-30', '2027-04-31', '2027-13-01', '', '31.03.2027']) {
      assert.ok(plan(bad).every((r) => r.iso === ''), `${bad || 'пусто'}: дата появилась`);
    }
  });

  it('день недели и месяц — словами, число и год неразрывны', () => {
    const day = plan('2027-03-31').at(-1)!;
    assert.equal(day.dateText, '31 марта 2027');
    assert.equal(day.note, 'среда');
  });

  it('«сегодня» — по Москве, UTC+3', () => {
    assert.equal(c.dpToday(Date.UTC(2026, 10, 4, 20, 59)), '2026-11-04');
    assert.equal(c.dpToday(Date.UTC(2026, 10, 4, 21, 0)), '2026-11-05');
    assert.equal(c.dpToday(Date.UTC(2026, 11, 31, 21, 30)), '2027-01-01');
  });

  it('прошедший срок отмечается, будущий — нет', () => {
    const rows = plan('2026-12-01', 0, '2026-11-04');
    assert.deepEqual(rows.map((r) => r.past), [false, true, true, false, false, false]);
    assert.equal(rows[1]!.note, 'срок прошёл');
    assert.equal(plan('2026-10-01', 0, '2026-11-04').at(-1)!.note, 'дата прошла');
  });
});

describe('границы блока «План от даты защиты»', () => {
  it('стоит сразу за «Порядком работы», перед «Как это выглядит внутри»', () => {
    const process = html.indexOf('<section id="process"');
    const here = html.indexOf('<section id="defense-plan"');
    const inside = html.indexOf('<section id="inside"');
    assert.ok(process > 0 && process < here && here < inside);
    assert.equal(html.slice(html.indexOf('</section>', process), here).match(/<section/gu), null, 'между «Порядком работы» и планом другой раздел');
  });

  it('формы нет: поле даты с видимой подписью и 16 px, действие — ссылка на #request', () => {
    assert.doesNotMatch(section, /<form|type="submit"|name="/u, 'план не форма заявки (Р-96)');
    assert.match(section, /<label for="mp-dp-date"[^>]*>Дата защиты<\/label>/u);
    assert.match(section, /<input id="mp-dp-date" type="date"[^>]*font-size:16px/u);
    assert.match(plain(section), /<a href="#request"[^>]*>Обсудить план с куратором<\/a>/u);
    assert.match(html, /<section id="request"/u, 'на странице нет формы #request');
  });

  it('обработчики не submit*, на сервер и в хранилища ничего не уходит', () => {
    const handlers = [...section.matchAll(/on[A-Z]\w*="\{\{\s*([\w.]+)\s*\}\}"/gu)].map((m) => m[1]!);
    assert.ok(handlers.includes('dpPick'));
    for (const h of handlers) assert.doesNotMatch(h, /(^|\.)submit/u, `${h}: перенос обернёт submit* в отправку заявки`);
    assert.doesNotMatch(script, /\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/u);
  });

  it('без библиотек дат: счёт — на Date.UTC', () => {
    assert.doesNotMatch(script, /moment|dayjs|date-fns|luxon/u);
    assert.match(script, /dpBack\(t, back\)\{/u);
  });

  it('перенесено в компонент', () => {
    assert.match(tsx, /id="defense-plan"/u);
    assert.match(tsx, /dpPlan\(value, kind, today\)\{/u);
    assert.match(tsx, /onChange=\{dpPick\}/u);
  });

  it('тексты блока проходят text-guard и не обещают результата', () => {
    const visible = plain(section.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, '\n'));
    const data = (c.dpRules() as Array<Record<string, any>>).map((r) => plain(r.title)).join('\n');
    const all = `${visible}\n${data}\n${plan('2027-03-31').map((r) => `${plain(r.rule)}\n${plain(r.cite)}\n${r.note}`).join('\n')}`;
    assert.deepEqual(findForbidden(all, 'План от даты защиты'), []);
    assert.doesNotMatch(all, /гарант|успешн|под ключ|напиш|уникальн|антиплагиат|₽|руб\./iu);
  });
});
