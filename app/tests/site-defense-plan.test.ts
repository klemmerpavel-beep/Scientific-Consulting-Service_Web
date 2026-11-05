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
 *   число или последний день месяца (31-е, февраль, високосный год), затем
 *   ещё день назад — полные дни и месяцы до защиты (решение владельца
 *   05.11.2026),
 *   «сегодня» — по Москве;
 * - границы блока: формы нет, обработчики не submit* (перенос обернул бы их
 *   в отправку заявки), сетевых вызовов и хранилищ нет; действие — ссылка
 *   на существующую форму #request (Р-96); блок стоит сразу за «Порядком
 *   работы»; тексты проходят text-guard.
 * - сводка для чтения с экрана (доводка 05.11.2026): одна область
 *   aria-live="polite" вне экрана; до первого действия пуста, после смены
 *   даты или вида — одна строка без повтора плана;
 * - Метрика без Вебвизора, пока подпись блока обещает, что даты не уходят
 *   на сервер: Вебвизор записал бы введённую дату и отправил её третьему
 *   лицу;
 * - доработка Р-811 (замечание владельца З-5): пока дата не выбрана — пример
 *   на защиту через 6 месяцев от сегодняшнего дня по Москве с меткой «Пример»,
 *   поле пустое, живая область молчит; «сегодня» берётся после монтирования,
 *   поэтому разметка сервера совпадает с первым рендером в браузере; под
 *   будущей датой — «осталось N дней» с согласованием по числу, срок сегодня —
 *   «сегодня»; ближайший предстоящий срок — один, на подложке акцентом
 *   (aria-current="step"); названия шагов короткие, полная формулировка
 *   Р-804 — подсказкой title и в тексте для чтения с экрана.
 *
 * Логика живёт в макете и переносится в компонент дословно, поэтому
 * выполняется сам сценарий макета с заглушкой DCLogic.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
/**
 * Короткие названия шагов (Р-811) и полные формулировки (Р-804) — подсказкой
 * title и для чтения с экрана. Сверенный перечень NORM сличается с полной
 * формулировкой: короткое название её только сокращает.
 */
const NAMES: Array<[string, string]> = [
  ['Разбор текста и предзащита', 'Разбор текста с куратором и предзащита на кафедре'],
  ['Объявление и автореферат на сайте ВАК', 'Объявление о защите и автореферат на сайте ВАК'],
  ['Рассылка автореферата', 'Рассылка автореферата членам совета и заинтересованным организациям'],
  ['Отзывы в совете', 'Отзывы оппонентов и ведущей организации в совете'],
  ['Копии отзывов вам', 'Копии отзывов вручаются вам'],
  ['Защита диссертации', 'Защита диссертации'],
];

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
      assert.match(plain(r.full), NORM[i]!.title);
    });
  });

  it('названия шагов короткие, полная формулировка — подсказкой и для чтения с экрана (Р-811)', () => {
    const rules = c.dpRules() as Array<Record<string, any>>;
    assert.deepEqual(rules.map((r) => [plain(r.title), plain(r.full)]), NAMES, 'название или полная формулировка шага изменились: сверьте с Р-804 и Р-811');
    for (const [short, full] of NAMES) assert.ok(short.length <= 40 && short.length <= full.length, `«${short}» — не короткое название`);
    assert.deepEqual(plan('2027-03-31').map((r) => plain(r.full)), NAMES.map((n) => n[1]), 'строка шкалы потеряла полную формулировку');
    const h3 = section.match(/<h3 class="pd-dp-title"[^>]*>([\s\S]*?)<\/h3>/u)?.[1];
    assert.equal(h3, '<span aria-hidden="true" title="{{ r.full }}">{{ r.title }}</span><span style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">{{ r.full }}</span>',
      'видимое короткое название скрыто от чтения с экрана, полная формулировка — подсказкой и вне экрана');
    assert.match(tsx, /<span aria-hidden="true" title=\{r\.full\}>\{r\.title\}<\/span><span style=\{\{[^}]*left: "-9999px"[^}]*\}\}>\{r\.full\}<\/span><\/h3>/u, 'перенос потерял полную формулировку');
    assert.match(html, /\.pd-dp-steps\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.25fr\) repeat\(4,minmax\(0,1fr\)\)/u,
      'на ≥1200 px колонка п. 26 шире: «Объявление и автореферат на сайте ВАК» — в две строки');
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
    ['2027-03-31', 0, ['2027-01-30', '2027-02-27', '2027-03-15', '2027-03-20']],
    ['2027-03-31', 1, ['2026-12-30', '2027-02-27', '2027-03-15', '2027-03-20']],
    ['2028-03-31', 0, ['2028-01-30', '2028-02-28', '2028-03-15', '2028-03-20']],
    ['2028-03-10', 0, ['2028-01-09', '2028-02-09', '2028-02-23', '2028-02-28']],
    ['2027-05-31', 1, ['2027-02-27', '2027-04-29', '2027-05-15', '2027-05-20']],
    ['2027-12-31', 0, ['2027-10-30', '2027-11-29', '2027-12-15', '2027-12-20']],
    ['2027-01-05', 1, ['2026-10-04', '2026-12-04', '2026-12-20', '2026-12-25']],
    ['2029-03-01', 0, ['2028-12-31', '2029-01-31', '2029-02-13', '2029-02-18']],
    ['2100-03-31', 0, ['2100-01-30', '2100-02-27', '2100-03-15', '2100-03-20']],
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
    assert.match(tsx, /<li className="pd-dp-step" data-kind=\{r\.kind\} aria-current=\{r\.current\}>/u, 'перенос потерял отметку ближайшего срока');
    assert.match(tsx, /\{dpExample \? \(<><p data-dp-example="true"/u, 'перенос потерял пример плана');
    assert.match(tsx, /\{r\.hasLeft \? \(<><span className="pd-dp-left"[^>]*>\{r\.left\}<\/span>/u, 'перенос потерял «осталось N дней»');
  });

  it('тексты блока проходят text-guard и не обещают результата', () => {
    const visible = plain(section.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]+>/gu, '\n'));
    const data = (c.dpRules() as Array<Record<string, any>>).map((r) => `${plain(r.title)}\n${plain(r.full)}`).join('\n');
    const rows = [...plan('2027-03-31'), ...plan('2026-12-01', 1, '2026-11-15')];
    const all = `${visible}\n${data}\n${rows.map((r) => `${plain(r.rule)}\n${plain(r.cite)}\n${r.note}\n${plain(r.left)}`).join('\n')}`;
    assert.deepEqual(findForbidden(all, 'План от даты защиты'), []);
    assert.doesNotMatch(all, /гарант|успешн|под ключ|напиш|уникальн|антиплагиат|₽|руб\./iu);
  });
});

describe('сводка изменений для чтения с экрана (доводка Р-804)', () => {
  const fresh = () => new Component();
  const FAR = '2099-03-31';

  it('одна область aria-live="polite" вне экрана, с выражением dpSay', () => {
    assert.equal((section.match(/aria-live=/gu) ?? []).length, 1, 'в блоке ровно одна живая область');
    assert.match(section, /<span aria-live="polite" aria-atomic="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">\{\{ dpSay \}\}<\/span>/u);
    assert.match(tsx, /<span aria-live="polite" aria-atomic="true" style=\{\{[^}]*left: "-9999px"[^}]*\}\}>\{dpSay\}<\/span>/u, 'перенос потерял живую область');
  });

  it('до первого действия пуста; смена даты и смена вида дают по одной строке', () => {
    const p: any = fresh();
    assert.equal(p.renderVals().dpSay, '', 'область объявила бы план при загрузке страницы');
    p.renderVals().dpPick({ target: { value: FAR } });
    assert.equal(plain(p.renderVals().dpSay), 'Защита 31 марта 2099, кандидатская диссертация, план обновлён');
    p.renderVals().dpKinds[1].pick();
    assert.equal(plain(p.renderVals().dpSay), 'Защита 31 марта 2099, докторская диссертация, план обновлён');
    p.renderVals().dpPick({ target: { value: '' } });
    assert.equal(plain(p.renderVals().dpSay), 'Докторская диссертация, дата защиты не выбрана, показан пример плана');
    const q: any = fresh();
    q.renderVals().dpKinds[1].pick();
    assert.equal(plain(q.renderVals().dpSay), 'Докторская диссертация, дата защиты не выбрана, показан пример плана');
  });

  it('смена вида при той же дате меняет текст области — иначе её не объявят', () => {
    assert.notEqual(c.dpSay(FAR, 0, '2026-11-05'), c.dpSay(FAR, 1, '2026-11-05'));
  });

  it('прошедшая дата защиты названа прошедшей', () => {
    assert.equal(plain(c.dpSay('2026-10-01', 0, '2026-11-05')), 'Защита 1 октября 2026, кандидатская диссертация, дата защиты прошла');
    assert.match(plain(c.dpSay('2026-11-05', 0, '2026-11-05')), /план обновлён$/u, 'день защиты сегодня — не прошедший');
  });

  it('сводка — одна строка без повтора плана', () => {
    const rules = c.dpRules() as Array<Record<string, any>>;
    for (const [date, kind] of [['2027-03-31', 0], ['2027-03-31', 1], ['', 0], ['2026-10-01', 1]] as const) {
      const say = plain(c.dpSay(date, kind, '2026-11-05'));
      assert.ok(say.length <= 80, `«${say}» длиннее 80 знаков`);
      assert.doesNotMatch(say, /\n/u);
      for (const r of rules) for (const name of [plain(r.title), plain(r.full)]) assert.ok(!say.includes(name), `«${say}» повторяет шаг «${name}»`);
      for (const r of plan(date, kind).filter((x) => x.kind === 'rule')) {
        assert.ok(!say.includes(plain(r.rule)), `«${say}» повторяет срок`);
        if (r.dateText !== '—') assert.ok(!say.includes(plain(r.dateText)), `«${say}» повторяет дату срока`);
      }
      assert.deepEqual(findForbidden(say, 'Сводка плана'), []);
      assert.doesNotMatch(say, /гарант|успешн|под ключ|напиш|уникальн|антиплагиат|₽|руб\./iu);
    }
  });
});

describe('Метрика без Вебвизора, пока подпись блока обещает, что даты не уходят на сервер', () => {
  const PROMISE = 'Даты считаются в браузере и не уходят на сервер';
  const sources = (dir: string): string[] => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'generated' ? [] : sources(rel);
    return /\.(tsx?|mjs|js)$/u.test(e.name) ? [rel] : [];
  });

  it('подпись есть на странице — счётчик инициализируется с webvisor:false', () => {
    const promised = plain(section).includes(PROMISE) || plain(tsx).includes(PROMISE);
    if (!promised) return; // подписи нет — обещания тоже нет
    const metrika = read('app/src/components/Metrika.tsx');
    const inits = [...metrika.matchAll(/ym\([\s\S]{0,60}?["']init["']\s*,\s*(\{[^}]*\})/gu)].map((m) => m[1]!);
    assert.equal(inits.length, 1, 'Metrika.tsx: инициализация счётчика не найдена или не одна');
    assert.match(inits[0]!, /(^|[{,\s])webvisor\s*:\s*false\b/u, `Metrika.tsx: Вебвизор не выключен явно (${inits[0]}) — он записал бы введённую дату`);
    assert.doesNotMatch(metrika, /webvisor\s*:\s*(true|!0|1)\b/u, 'Metrika.tsx: Вебвизор включён');
  });

  it('сценарий Метрики и её инициализация — только в Metrika.tsx', () => {
    const files = sources('app/src').filter((f) => /mc\.yandex\.ru\/metrika|["']init["']\s*,\s*\{[^}]*webvisor/u.test(read(f)));
    assert.deepEqual(files, [path.join('app', 'src', 'components', 'Metrika.tsx')], 'счётчик подключается мимо Metrika.tsx');
  });
});

describe('Р-811: пример без даты, «осталось N дней», ближайший срок', () => {
  const fresh = () => new Component();
  const TODAY = '2026-11-05';
  const mounted = (today = TODAY) => { const p: any = fresh(); p.setState({ dpNow: today }); return p; };

  it('пустое поле — пример на защиту через 6 месяцев от сегодняшнего дня, с меткой «Пример»; поле пустое, живая область молчит', () => {
    const p = mounted();
    const v = p.renderVals();
    assert.equal(v.dpExample, true);
    assert.equal(p.state.dpDate, '', 'пример записался в поле даты');
    assert.equal(v.dpSay, '', 'живая область заговорила до действия посетителя');
    assert.equal(v.dpRows.at(-1).iso, '2027-05-05', 'пример — не через 6 месяцев от сегодняшнего дня');
    assert.deepEqual(v.dpRows.filter((r: any) => r.kind === 'rule').map((r: any) => r.iso), ['2027-03-04', '2027-04-04', '2027-04-19', '2027-04-24'],
      'сроки примера считаются тем же счётом полных дней и месяцев');
    assert.match(plain(section), /<sc-if value="\{\{ dpExample \}\}"[^>]*>\s*<p data-dp-example="true"[^>]*><span [^>]*text-transform:uppercase[^>]*>Пример<\/span><span>Защита через 6 месяцев от сегодняшнего дня\. Укажите свою дату, и сроки пересчитаются\.<\/span><\/p>\s*<\/sc-if>/u,
      'нет метки «Пример» с подписью над шкалой');
    assert.doesNotMatch(section.match(/<input id="mp-dp-date"[^>]*>/u)![0], /\svalue=/u, 'поле даты заполняется примером');
  });

  it('выбранная дата заменяет пример, очистка поля возвращает его, сводка называет пример', () => {
    const p = mounted();
    p.renderVals().dpPick({ target: { value: '2099-03-31' } });
    let v = p.renderVals();
    assert.equal(v.dpExample, false);
    assert.equal(v.dpRows.at(-1).iso, '2099-03-31');
    p.setState({ dpNow: TODAY });
    p.renderVals().dpPick({ target: { value: '' } });
    p.setState({ dpNow: TODAY });
    v = p.renderVals();
    assert.equal(v.dpExample, true);
    assert.equal(v.dpRows.at(-1).iso, '2027-05-05');
    assert.equal(plain(v.dpSay), 'Кандидатская диссертация, дата защиты не выбрана, показан пример плана');
  });

  it('до монтирования примера нет: разметка сервера не зависит от даты сборки, строки заняты заранее', () => {
    const v = fresh().renderVals();
    assert.equal(v.dpExample, true, 'метка «Пример» появилась бы после загрузки и сдвинула шкалу');
    assert.ok(v.dpRows.every((r: any) => r.iso === '' && !r.soon), 'дата сборки попала в разметку: гидратация разойдётся с датой посещения');
    for (const r of v.dpRows.filter((x: any) => x.kind !== 'free')) {
      assert.equal(r.dateText, '—');
      assert.equal(r.note, ' ', 'строка дня недели не занята — шкала прыгнет после монтирования');
      assert.equal(r.left, ' ', 'строка отсчёта не занята — шкала прыгнет после монтирования');
      assert.equal(r.hasLeft, true);
    }
    const mount = script.slice(script.indexOf('componentDidMount(){'), script.indexOf('componentWillUnmount(){'));
    assert.match(mount, /this\.setState\(\{ dpNow: this\.dpToday\(\) \}\);/u, '«сегодня» не ставится при монтировании');
    const vals = script.slice(script.indexOf('renderVals(){'));
    assert.doesNotMatch(vals.slice(0, vals.indexOf('dpKinds:')), /dpToday\(\)/u, 'renderVals берёт «сегодня» мимо состояния — дата сборки уйдёт в разметку');
  });

  it('пример: то же число через 6 месяцев или последний день месяца', () => {
    for (const [today, want] of [['2026-11-05', '2027-05-05'], ['2026-06-15', '2026-12-15'], ['2026-08-31', '2027-02-28'], ['2027-08-31', '2028-02-29'], ['2026-12-31', '2027-06-30'], ['2026-07-01', '2027-01-01']]) {
      assert.equal(c.dpExample(today), want, today);
    }
    assert.equal(c.dpExample(''), '');
  });

  it('«осталось N дней»: число и согласование — 1 день, 2 дня, 5 дней, 11 дней, 21 день', () => {
    const CASES: Array<[number, string]> = [
      [1, 'остался 1 день'], [2, 'осталось 2 дня'], [4, 'осталось 4 дня'], [5, 'осталось 5 дней'], [11, 'осталось 11 дней'],
      [12, 'осталось 12 дней'], [14, 'осталось 14 дней'], [21, 'остался 21 день'], [22, 'осталось 22 дня'], [101, 'остался 101 день'],
      [111, 'осталось 111 дней'], [112, 'осталось 112 дней'], [181, 'остался 181 день'],
    ];
    for (const [n, want] of CASES) assert.equal(plain(c.dpLeft(n)), want, `${n}`);
    // Защита 01.12.2026: 15 дней — 15.11, 10 дней — 20.11, защита — 01.12.
    const left = (today: string) => plan('2026-12-01', 0, today).filter((r) => r.kind !== 'free').map((r) => plain(r.left));
    assert.deepEqual(left('2026-11-14'), ['', '', 'остался 1 день', 'осталось 6 дней', 'осталось 17 дней']);
    assert.deepEqual(left('2026-11-13'), ['', '', 'осталось 2 дня', 'осталось 7 дней', 'осталось 18 дней']);
    assert.deepEqual(left('2026-11-10'), ['', '', 'осталось 5 дней', 'осталось 10 дней', 'остался 21 день']);
    assert.deepEqual(left('2026-11-04'), ['', '', 'осталось 11 дней', 'осталось 16 дней', 'осталось 27 дней']);
  });

  it('граница «сегодня»: срок сегодня — не прошёл и ближайший, назавтра — «срок прошёл»', () => {
    let rows = plan('2026-12-01', 0, '2026-11-15');
    assert.equal(rows[3]!.iso, '2026-11-15');
    assert.equal(rows[3]!.past, false);
    assert.equal(plain(rows[3]!.left), 'сегодня');
    assert.equal(rows[3]!.note, 'воскресенье');
    assert.equal(rows[3]!.current, 'step');
    rows = plan('2026-12-01', 0, '2026-11-16');
    assert.equal(rows[3]!.past, true);
    assert.equal(rows[3]!.note, 'срок прошёл');
    assert.equal(rows[3]!.left, '');
    assert.equal(rows[3]!.hasLeft, false, 'под прошедшим сроком — отсчёт');
    assert.equal(rows[4]!.current, 'step', 'ближайший срок не перешёл к следующему');
    const day = plan('2026-11-05', 0, '2026-11-05').at(-1)!;
    assert.equal(day.past, false);
    assert.equal(plain(day.left), 'сегодня');
    assert.equal(day.current, 'step');
  });

  it('ближайший срок — один: первая дата не раньше сегодняшней, выделен подложкой и aria-current', () => {
    const marked = (date: string, kind: number, today: string) => plan(date, kind, today).filter((r) => r.current === 'step');
    assert.equal(marked('2027-03-31', 0, '2026-11-05').length, 1);
    assert.equal(plain(marked('2027-03-31', 0, '2026-11-05')[0]!.cite), 'п. 26 Положения');
    assert.equal(plain(marked('2026-12-01', 0, '2026-11-05')[0]!.cite), 'пп. 23 и 24 Положения');
    assert.equal(marked('2026-12-01', 0, '2026-11-25')[0]!.kind, 'day');
    assert.equal(marked('2026-10-01', 0, '2026-11-05').length, 0, 'всё прошло — выделять нечего');
    for (const r of plan('2027-03-31', 0, '2026-11-05')) {
      assert.equal(r.soon, r.current === 'step');
      assert.equal(r.dateInk, r.soon ? 'var(--pd-accent)' : (r.kind === 'free' ? 'var(--pd-ink-muted)' : 'var(--pd-ink)'));
      assert.equal(r.leftInk, r.soon ? 'var(--pd-accent)' : 'var(--pd-ink-secondary)');
      if (r.kind === 'free') assert.ok(!r.hasLeft && r.current === 'false', 'у шага без срока — отсчёт или выделение');
    }
    assert.match(section, /<li class="pd-dp-step" data-kind="\{\{ r\.kind \}\}" aria-current="\{\{ r\.current \}\}">/u);
    assert.match(html, /\.pd-dp-step\[aria-current="step"\]::before\{content:"";position:absolute;z-index:-1;[^}]*background:var\(--pd-accent-tint\)\}/u, 'ближайший срок без подложки');
    assert.match(html, /\.pd-dp-step\[aria-current="step"\]\{isolation:isolate\}/u, 'подложка уйдёт под белую карточку');
  });
});
