/**
 * Виджет замечаний без персональных данных (решение Р-277): шаблон пути,
 * область, устройство, критичность по правилам, отказ на контакты,
 * сигнатуры снимков и приём запроса — без базы.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  BODY_MAX_BYTES,
  RATE_LIMIT_MESSAGE,
  SCREENSHOT_MAX_BYTES,
  TEXT_HAS_CONTACTS,
  TEXT_TOO_LONG,
  TEXT_TOO_SHORT,
  areaOf,
  autoSeverity,
  deviceOf,
  feedbackEnabled,
  parseWidth,
  pathTemplate,
  prepareFeedback,
  sniffImage,
  FeedbackInputError,
} from '../src/lib/feedback.ts';
import { clientIp, receiveFeedback } from '../src/lib/feedback-intake.ts';
import { RateLimiter } from '../src/lib/rate-limit.ts';

const APP = path.join(import.meta.dirname, '..');
const CUID = 'cmg1x2y3z4a5b6c7d8e9f0g1h';

describe('шаблон пути', () => {
  const cases: readonly [string, string][] = [
    ['/', '/'],
    ['', '/'],
    ['/main', '/main'],
    ['/students', '/students'],
    ['/business', '/business'],
    ['/offer', '/offer'],
    ['/privacy', '/privacy'],
    ['/consent', '/consent'],
    ['/cabinet', '/cabinet'],
    ['/cabinet/projects', '/cabinet/projects'],
    ['/cabinet/manage/leads', '/cabinet/manage/leads'],
    ['/cabinet/manage/leads/export', '/cabinet/manage/leads/export'],
    ['/cabinet/manage/finance/years', '/cabinet/manage/finance/years'],
    // Ключ входа — самое опасное в адресе: по нему входят.
    ['/cabinet/enter/Zx81_kq-9Lm', '/cabinet/enter/[ссылка]'],
    ['/cabinet/enter/abc', '/cabinet/enter/[ссылка]'],
    // Коды работ.
    ['/cabinet/projects/PD-2026-057', '/cabinet/projects/[код]'],
    ['/cabinet/projects/PD-2026-057/materials', '/cabinet/projects/[код]/materials'],
    ['/cabinet/projects/K2-old/payments', '/cabinet/projects/[код]/payments'],
    // Идентификаторы записей за известными разделами.
    [`/cabinet/stages/${CUID}`, '/cabinet/stages/[id]'],
    ['/cabinet/stages/short1', '/cabinet/stages/[id]'],
    [`/cabinet/manage/leads/${CUID}`, '/cabinet/manage/leads/[id]'],
    [`/cabinet/manage/import/${CUID}`, '/cabinet/manage/import/[id]'],
    [`/cabinet/files/${CUID}`, '/cabinet/files/[id]'],
    [`/cabinet/lead-files/${CUID}`, '/cabinet/lead-files/[id]'],
    // Любые сегменты, похожие на идентификатор.
    ['/cabinet/whatever/abcdefghij0123456789', '/cabinet/whatever/[id]'],
    ['/cabinet/x/abcdefghijklmnopq', '/cabinet/x/[id]'],
    ['/cabinet/x/ab12cd34ef56', '/cabinet/x/[id]'],
    ['/cabinet/x/0b6f6c1e-7d6a-4bd6-9a51-0c2f3b9e1a77', '/cabinet/x/[id]'],
    // Строка запроса и якорь не записываются вовсе.
    ['/cabinet/manage/leads?query=Иванов&status=NEW', '/cabinet/manage/leads'],
    ['/main#request', '/main'],
    ['/students?utm_source=x#faq', '/students'],
    // Полный адрес сводится к пути.
    ['https://prodisser.ru/business?x=1', '/business'],
    // Несуществующий адрес на сайте человек набирает сам.
    ['/79001234567', '/[id]'],
    ['/ivanov@mail.ru', '/[id]'],
    ['/%D0%B8%D0%B2%D0%B0%D0%BD', '/[id]'],
    ['/Ivanov', '/[id]'],
    ['/no-such-page', '/no-such-page'],
    // Лишние косые черты и косая черта в конце.
    ['//cabinet//projects/', '/cabinet/projects'],
    ['/cabinet-preview/index.html', '/cabinet-preview/index.html'],
  ];
  for (const [raw, expected] of cases) {
    it(`${raw || '(пусто)'} → ${expected}`, () => {
      assert.equal(pathTemplate(raw), expected);
    });
  }

  it('второй проход шаблон не меняет', () => {
    for (const [raw] of cases) {
      const once = pathTemplate(raw);
      assert.equal(pathTemplate(once), once, raw);
    }
  });
});

describe('область', () => {
  it('кабинет — /cabinet и всё под ним', () => {
    assert.equal(areaOf('/cabinet'), 'CABINET');
    assert.equal(areaOf('/cabinet/projects'), 'CABINET');
    assert.equal(areaOf('/cabinet/enter/abc?x=1'), 'CABINET');
  });
  it('всё прочее — сайт, включая /cabinet-preview', () => {
    for (const p of ['/', '/main', '/students', '/offer', '/cabinet-preview', '/cabinetx', '/no-such']) {
      assert.equal(areaOf(p), 'SITE', p);
    }
  });
});

describe('устройство по ширине окна', () => {
  it('границы 768 и 1100', () => {
    assert.equal(deviceOf(360), 'телефон');
    assert.equal(deviceOf(767), 'телефон');
    assert.equal(deviceOf(768), 'планшет');
    assert.equal(deviceOf(1099), 'планшет');
    assert.equal(deviceOf(1100), 'компьютер');
    assert.equal(deviceOf(1920), 'компьютер');
    assert.equal(deviceOf(null), 'не определено');
  });
  it('ширина — целое от 200 до 10000, иначе неизвестна', () => {
    assert.equal(parseWidth('1280'), 1280);
    assert.equal(parseWidth(390), 390);
    assert.equal(parseWidth('200'), 200);
    assert.equal(parseWidth('10000'), 10000);
    for (const bad of ['199', '10001', '12.5', '-5', 'abc', '', null, undefined, '1e3']) {
      assert.equal(parseWidth(bad), null, String(bad));
    }
  });
});

describe('критичность по правилам', () => {
  it('критично', () => {
    for (const text of [
      'Форма не работает', 'Страница не открывается', 'Заявка не отправилась', 'Файл не загружается',
      'Ничего не сохраняется', 'Не могу войти в кабинет', 'Не пускает по ссылке', 'Ошибка 500',
      'Какой-то сбой', 'Пропал этап', 'Потерял файл', 'Кто-то удалил комментарий',
      'Белый экран', 'Всё зависает', 'Не приходит ссылка на почту',
    ]) {
      assert.equal(autoSeverity(text, 'SITE', '/main'), 'CRITICAL', text);
    }
  });
  it('деньги в кабинете — критично, на сайте — нет', () => {
    assert.equal(autoSeverity('Неясно, как оплатить', 'CABINET', '/cabinet/projects'), 'CRITICAL');
    assert.equal(autoSeverity('Где деньги за этап', 'CABINET', '/cabinet/payout'), 'CRITICAL');
    assert.equal(autoSeverity('Сумма другая', 'CABINET', '/cabinet/projects/[код]/payments'), 'CRITICAL');
    assert.equal(autoSeverity('Неясно, как оплатить', 'SITE', '/offer'), 'MEDIUM');
  });
  it('высокая', () => {
    for (const text of [
      'Тут ошибка в тексте', 'Кнопку не видно', 'Таблица не отображается', 'Неправильная дата',
      'Неверный срок', 'Не тот этап', 'Не та работа', 'Текст налезает на картинку',
      'Подпись обрезана', 'Меню съехало', 'Кнопка не нажимается', 'Ссылка не кликается',
      'Долго грузится главная',
    ]) {
      assert.equal(autoSeverity(text, 'SITE', '/main'), 'HIGH', text);
    }
  });
  it('любое замечание с формы входа — высокая', () => {
    assert.equal(autoSeverity('Непонятно, что писать', 'CABINET', '/cabinet'), 'HIGH');
    assert.equal(autoSeverity('Непонятно, что нажимать', 'CABINET', '/cabinet/enter/[ссылка]'), 'HIGH');
    assert.equal(autoSeverity('Непонятно, что нажимать', 'CABINET', '/cabinet/projects'), 'MEDIUM');
  });
  it('низкая', () => {
    for (const text of [
      'Опечатка в заголовке', 'Предлагаю добавить фильтр', 'Хорошо бы крупнее', 'Было бы удобно видеть срок',
      'Мелочь, но приятно', 'Пожелание: тёмная тема', 'Цвет кнопки', 'Шрифт мелковат',
    ]) {
      assert.equal(autoSeverity(text, 'SITE', '/main'), 'LOW', text);
    }
  });
  it('прочее — средняя', () => {
    assert.equal(autoSeverity('Непонятно, куда нажать дальше', 'SITE', '/students'), 'MEDIUM');
  });
  it('регистр и «ё» не важны', () => {
    assert.equal(autoSeverity('НЕ РАБОТАЕТ', 'SITE', '/'), 'CRITICAL');
    assert.equal(autoSeverity('Съёхал блок', 'SITE', '/'), 'HIGH');
    assert.equal(autoSeverity('Потерялось всё', 'SITE', '/'), 'CRITICAL');
    assert.equal(autoSeverity('Шрифт   мелкий', 'SITE', '/'), 'LOW');
    assert.equal(autoSeverity('ХОРОШО    БЫ поправить', 'SITE', '/'), 'LOW');
  });
  it('порядок: критично выше высокой, высокая выше низкой', () => {
    assert.equal(autoSeverity('Опечатка, и форма не работает', 'SITE', '/'), 'CRITICAL');
    assert.equal(autoSeverity('Ошибка: шрифт не тот', 'SITE', '/'), 'HIGH');
    assert.equal(autoSeverity('Хорошо бы поправить, кнопку не видно', 'SITE', '/'), 'HIGH');
    assert.equal(autoSeverity('Опечатка на форме входа', 'CABINET', '/cabinet'), 'HIGH');
  });
  it('«не та» не ловит «не так»', () => {
    assert.equal(autoSeverity('Что-то не так с отступами', 'SITE', '/'), 'MEDIUM');
  });
});

describe('текст замечания', () => {
  it('короткое и пустое не принимается', () => {
    for (const text of ['', '  ', 'ок', ' а ']) {
      const result = prepareFeedback({ text, path: '/', width: '1280' });
      assert.deepEqual(result, { ok: false, error: TEXT_TOO_SHORT }, JSON.stringify(text));
    }
  });
  it('длиннее 5000 знаков не принимается', () => {
    assert.deepEqual(prepareFeedback({ text: 'а'.repeat(5001), path: '/', width: null }), {
      ok: false,
      error: TEXT_TOO_LONG,
    });
    assert.equal(prepareFeedback({ text: 'а'.repeat(5000), path: '/', width: null }).ok, true);
  });
  it('телефон, почта и ссылка на мессенджер — отказ с объяснением', () => {
    for (const text of [
      'Перезвоните мне +7 900 123-45-67',
      'Пишите на ivanov@mail.ru',
      'Я в телеграме t.me/ivanov',
      'Мой ник @ivanov_petr',
    ]) {
      const result = prepareFeedback({ text, path: '/main', width: '390' });
      assert.deepEqual(result, { ok: false, error: TEXT_HAS_CONTACTS }, text);
    }
    assert.equal(
      TEXT_HAS_CONTACTS,
      'Уберите из замечания телефон, почту или ссылку на мессенджер: виджет не собирает персональные данные.',
    );
  });
  it('принятое сведено к записи: шаблон, область, устройство, критичность', () => {
    const result = prepareFeedback({
      text: '  Кнопка не нажимается на телефоне  ',
      path: `/cabinet/stages/${CUID}?tab=files`,
      width: '390',
    });
    assert.deepEqual(result, {
      ok: true,
      value: {
        area: 'CABINET',
        pathTemplate: '/cabinet/stages/[id]',
        text: 'Кнопка не нажимается на телефоне',
        device: 'телефон',
        viewportWidth: 390,
        severityAuto: 'HIGH',
      },
    });
  });
  it('нулевой знак вычищается — PostgreSQL его не принимает', () => {
    const result = prepareFeedback({ text: 'Сло\u0000во и ещё', path: '/', width: null });
    assert.equal(result.ok && result.value.text, 'Слово и ещё');
  });
});

describe('сигнатуры снимка', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
  const webp = new Uint8Array([...Buffer.from('RIFF'), 0x24, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]);

  it('PNG, JPEG и WEBP распознаются по первым байтам', () => {
    assert.deepEqual(sniffImage(png), { ext: 'png', type: 'image/png' });
    assert.deepEqual(sniffImage(jpeg), { ext: 'jpg', type: 'image/jpeg' });
    assert.deepEqual(sniffImage(webp), { ext: 'webp', type: 'image/webp' });
  });
  it('прочее — отказ, как бы файл ни назывался', () => {
    const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'));
    const html = new Uint8Array(Buffer.from('<!doctype html><html>'));
    const gif = new Uint8Array(Buffer.from('GIF89a......'));
    const riffAvi = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('AVI ')]);
    for (const bytes of [svg, html, gif, riffAvi, new Uint8Array(0), png.subarray(0, 4)]) {
      assert.equal(sniffImage(bytes), null);
    }
  });
});

describe('выключатель', () => {
  it('off — выключено, прочее и отсутствие — включено', () => {
    assert.equal(feedbackEnabled('off'), false);
    assert.equal(feedbackEnabled(' OFF '), false);
    assert.equal(feedbackEnabled(undefined), true);
    assert.equal(feedbackEnabled(''), true);
    assert.equal(feedbackEnabled('on'), true);
    assert.equal(feedbackEnabled('1'), true);
  });
});

describe('приём запроса', () => {
  type Saved = { text: unknown; path: unknown; width: unknown; screenshot: Uint8Array | null };

  function setup(options: { enabled?: boolean; limit?: number; fail?: Error } = {}) {
    const saved: Saved[] = [];
    const limiter = new RateLimiter({ windowMs: 60_000, limit: options.limit ?? 100, maxKeys: 100 });
    const call = (form: FormData, headers: Record<string, string> = {}) =>
      receiveFeedback(
        new Request('http://localhost/api/feedback', { method: 'POST', body: form, headers }),
        {
          enabled: options.enabled ?? true,
          limiter,
          now: () => 1_000_000,
          save: async (input) => {
            if (options.fail !== undefined) throw options.fail;
            saved.push(input);
          },
        },
      );
    return { saved, call };
  }

  function form(fields: Record<string, string | Blob> = {}): FormData {
    const data = new FormData();
    const all = { text: 'Кнопка съехала', path: '/main', width: '1280', company_website: '', openedAt: '990000', ...fields };
    for (const [key, value] of Object.entries(all)) data.set(key, value);
    return data;
  }

  it('принимает замечание и отдаёт { ok: true }', async () => {
    const { saved, call } = setup();
    const response = await call(form());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(saved.length, 1);
    assert.equal(saved[0]!.text, 'Кнопка съехала');
    assert.equal(saved[0]!.screenshot, null);
  });

  it('выключенный виджет — 404, и ничего не пишется', async () => {
    const { saved, call } = setup({ enabled: false });
    const response = await call(form());
    assert.equal(response.status, 404);
    assert.equal(saved.length, 0);
  });

  it('ловушка и отправка быстрее 1,2 с — молча «записано», без записи', async () => {
    const { saved, call } = setup();
    const trap = await call(form({ company_website: 'http://spam.example' }));
    assert.deepEqual([trap.status, await trap.json()], [200, { ok: true }]);
    const fast = await call(form({ openedAt: String(1_000_000 - 500) }));
    assert.deepEqual([fast.status, await fast.json()], [200, { ok: true }]);
    assert.equal(saved.length, 0);
  });

  it('часы браузера впереди сервера — не робот', async () => {
    const { saved, call } = setup();
    await call(form({ openedAt: String(1_000_000 + 60_000) }));
    await call(form({ openedAt: '' }));
    assert.equal(saved.length, 2);
  });

  it('одиннадцатое замечание с адреса за окно — 429 с объяснением', async () => {
    const { call } = setup({ limit: 10 });
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await call(form(), { 'x-real-ip': '203.0.113.7' })).status, 200);
    }
    const refused = await call(form(), { 'x-real-ip': '203.0.113.7' });
    assert.equal(refused.status, 429);
    assert.deepEqual(await refused.json(), { ok: false, error: RATE_LIMIT_MESSAGE });
    // Другой адрес — свой счёт.
    assert.equal((await call(form(), { 'x-real-ip': '203.0.113.8' })).status, 200);
  });

  it('тело больше 6 МБ по заголовку — 413 до разбора', async () => {
    const { saved, call } = setup();
    const response = await call(form(), { 'content-length': String(BODY_MAX_BYTES + 1) });
    assert.equal(response.status, 413);
    assert.equal(saved.length, 0);
  });

  it('тело больше 6 МБ без заголовка — 413 по прочитанному', async () => {
    const { saved, call } = setup();
    const big = new Blob([new Uint8Array(BODY_MAX_BYTES + 10)], { type: 'image/png' });
    const response = await call(form({ screenshot: new File([big], 'a.png') }));
    assert.equal(response.status, 413);
    assert.equal(saved.length, 0);
  });

  it('снимок больше 5 МБ — 413', async () => {
    const { saved, call } = setup();
    const shot = new File([new Uint8Array(SCREENSHOT_MAX_BYTES + 1)], 'a.png', { type: 'image/png' });
    const response = await call(form({ screenshot: shot }));
    assert.equal(response.status, 413);
    assert.equal(saved.length, 0);
  });

  it('снимок передаётся службе байтами, пустой файл — как его отсутствие', async () => {
    const { saved, call } = setup();
    await call(form({ screenshot: new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], 'x.png') }));
    await call(form({ screenshot: new File([], '') }));
    assert.deepEqual([...(saved[0]!.screenshot ?? [])], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(saved[1]!.screenshot, null);
  });

  it('отказ службы — её причина и код', async () => {
    const { call } = setup({ fail: new FeedbackInputError(TEXT_TOO_SHORT) });
    const response = await call(form());
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { ok: false, error: TEXT_TOO_SHORT });
  });

  it('сбой записи — 503 без подробностей', async () => {
    const { call } = setup({ fail: new Error('relation "Feedback" does not exist') });
    const original = console.error;
    console.error = () => undefined;
    try {
      const response = await call(form());
      assert.equal(response.status, 503);
      const body = (await response.json()) as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.doesNotMatch(body.error, /relation|Feedback/u);
    } finally {
      console.error = original;
    }
  });

  it('не JSON и не форма — 400', async () => {
    const limiter = new RateLimiter({ windowMs: 60_000, limit: 100, maxKeys: 100 });
    const response = await receiveFeedback(
      new Request('http://localhost/api/feedback', { method: 'POST', body: 'просто текст', headers: { 'content-type': 'text/plain' } }),
      { enabled: true, limiter, save: async () => undefined },
    );
    assert.equal(response.status, 400);
  });

  it('адрес — из X-Real-IP, иначе последний в X-Forwarded-For', () => {
    assert.equal(clientIp(new Headers({ 'x-real-ip': '198.51.100.1', 'x-forwarded-for': '1.1.1.1' })), '198.51.100.1');
    assert.equal(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 198.51.100.2' })), '198.51.100.2');
    assert.equal(clientIp(new Headers()), 'unknown');
  });
});

describe('устройство маршрута и виджета', () => {
  const read = (...parts: string[]) => readFileSync(path.join(APP, ...parts), 'utf8');
  /** Исходник без комментариев: запрет касается кода, а не пояснений к нему. */
  const code = (text: string) =>
    text.replace(/\{\/\*[\s\S]*?\*\/\}/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');

  it('маршрут: nodejs, динамический, приём через общий разбор, без cookies и сессии', () => {
    const route = code(read('src', 'app', 'api', 'feedback', 'route.ts'));
    assert.match(route, /export const runtime = 'nodejs';/u);
    assert.match(route, /export const dynamic = 'force-dynamic';/u);
    assert.match(route, /receiveFeedback\(request,/u);
    assert.match(route, /enabled: feedbackEnabled\(\)/u);
    assert.doesNotMatch(route, /cookies|currentActor|session|user-agent/iu);
  });

  it('приём и служба не пишут адрес и строку браузера', () => {
    const intake = code(read('src', 'lib', 'feedback-intake.ts'));
    const service = read('src', 'lib', 'cabinet', 'feedback.ts');
    assert.doesNotMatch(intake, /user-agent|cookies\(\)/iu);
    const create = service.slice(service.indexOf('export async function createFeedback'), service.indexOf('// ───────────────────────────── Разбор'));
    assert.doesNotMatch(code(create), /\bip\b|userAgent|actor/iu);
  });

  it('виджет: без cookies, подпись кнопки, диалог, только шаблон пути', () => {
    const widget = read('src', 'components', 'FeedbackWidget.tsx');
    assert.match(widget, /credentials: 'omit'/u);
    assert.match(widget, /aria-label="Оставить замечание"/u);
    assert.match(widget, /role="dialog"/u);
    assert.match(widget, /aria-modal="true"/u);
    assert.match(widget, /Замечание о странице/u);
    assert.match(widget, /data\.set\('path', template\)/u);
    assert.match(widget, /accept="image\/png,image\/jpeg,image\/webp"/u);
    assert.match(widget, /cubic-bezier\(\.2,0,\.2,1\)/u);
    assert.match(widget, /prefers-reduced-motion:reduce/u);
    assert.match(widget, /@media print\{\.pd-fb\{display:none!important\}\}/u);
    // Поле снимка — только на страницах сайта.
    assert.match(widget, /\{site \? \(/u);
  });

  it('виджет подключён в общей разметке рядом с Метрикой', () => {
    const layout = read('src', 'app', 'layout.tsx');
    assert.match(layout, /<Metrika \/>\s*\{\/\*[\s\S]*?\*\/\}\s*<FeedbackWidget \/>/u);
  });

  it('nginx пропускает к приёму тело до 6 МБ', () => {
    const conf = readFileSync(path.join(APP, '..', 'deploy', 'nginx.conf'), 'utf8');
    const block = conf.slice(conf.indexOf('location = /api/feedback'));
    assert.match(block, /client_max_body_size 6m;/u);
  });
});
