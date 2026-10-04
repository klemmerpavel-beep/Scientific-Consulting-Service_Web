/**
 * Выгрузка и разбор замечаний по ключу (решение Р-279): проверка ключа,
 * разбор запроса и ответы — на настоящих запросах, без базы.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  EXPORT_KEY_MIN,
  REVIEW_BODY_MAX,
  exportKeyOk,
  handleExportList,
  handleExportReview,
  handleExportScreenshot,
  parseReviewPatch,
  parseStatuses,
  toExportItem,
  type ExportOptions,
  type ExportRow,
  type ReviewPatch,
} from '../src/lib/feedback-export.ts';
import { RateLimiter } from '../src/lib/rate-limit.ts';

const KEY = 'k'.repeat(EXPORT_KEY_MIN) + '0123456789abcdef';
const ROOT = path.join(import.meta.dirname, '..', '..');

const ROW: ExportRow = {
  id: 'fb1',
  createdAt: new Date('2026-10-04T12:01:00Z'),
  area: 'SITE',
  pathTemplate: '/main',
  text: 'Не отправляется форма заявки',
  device: 'компьютер',
  viewportWidth: 1440,
  screenshotKey: 'feedback/abc.png',
  screenshotType: 'image/png',
  screenshotSize: 16,
  severityAuto: 'CRITICAL',
  severity: 'CRITICAL',
  status: 'NEW',
  note: null,
  resolvedAt: null,
};

function options(overrides: Partial<ExportOptions> = {}) {
  const calls: { list: unknown[]; review: [string, ReviewPatch][]; shot: string[] } = { list: [], review: [], shot: [] };
  const opts: ExportOptions = {
    secret: KEY,
    limiter: new RateLimiter({ windowMs: 60_000, limit: 100, maxKeys: 10 }),
    now: () => new Date('2026-10-04T12:30:00Z'),
    service: {
      async list(statuses) {
        calls.list.push(statuses);
        return [ROW];
      },
      async screenshot(id) {
        calls.shot.push(id);
        if (id !== 'fb1') return null;
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        return {
          stream: new Response(bytes).body!,
          sizeBytes: bytes.byteLength,
          contentType: 'image/png',
        };
      },
      async review(id, patch) {
        calls.review.push([id, patch]);
        if (id !== 'fb1') return null;
        if (patch.note === 'сбой') throw new Error('«Что сделано» длиннее 2000 знаков — сократите');
        if (patch.note === 'база') throw new TypeError('Invalid `prisma.feedback.update()` invocation');
        return { ...ROW, ...patch, resolvedAt: patch.status === 'FIXED' ? new Date('2026-10-04T13:00:00Z') : null };
      },
    },
    ...overrides,
  };
  return { opts, calls };
}

const URL_BASE = 'https://prodisser.ru/api/feedback/export';

function request(url: string, init: RequestInit & { key?: string | null } = {}) {
  const { key = KEY, headers, ...rest } = init;
  const h = new Headers(headers);
  if (key !== null) h.set('authorization', `Bearer ${key}`);
  h.set('x-real-ip', '203.0.113.7');
  return new Request(url, { ...rest, headers: h });
}

describe('ключ выгрузки', () => {
  it('совпавший ключ пропускает', () => {
    assert.equal(exportKeyOk(`Bearer ${KEY}`, KEY), true);
    assert.equal(exportKeyOk(`Bearer   ${KEY}  `, ` ${KEY}\n`), true);
  });

  it('ключ не задан или короче 32 знаков — выгрузки нет', () => {
    assert.equal(exportKeyOk(`Bearer ${KEY}`, undefined), false);
    assert.equal(exportKeyOk('Bearer ', ''), false);
    const short = 'x'.repeat(EXPORT_KEY_MIN - 1);
    assert.equal(exportKeyOk(`Bearer ${short}`, short), false);
  });

  it('чужой ключ, пустой заголовок и иная схема отклоняются', () => {
    assert.equal(exportKeyOk(`Bearer ${KEY}x`, KEY), false);
    assert.equal(exportKeyOk(null, KEY), false);
    assert.equal(exportKeyOk(KEY, KEY), false);
    assert.equal(exportKeyOk(`Basic ${KEY}`, KEY), false);
  });
});

describe('разбор запроса', () => {
  it('отбор по состояниям: известные значения, без повторов', () => {
    assert.equal(parseStatuses(null), null);
    assert.equal(parseStatuses(' '), null);
    assert.deepEqual(parseStatuses('new,IN_WORK,new'), ['NEW', 'IN_WORK']);
    assert.equal(parseStatuses('DROP TABLE'), null);
  });

  it('правка разбора: поля по перечню, неизвестные и пустая отклоняются', () => {
    assert.deepEqual(parseReviewPatch({ status: 'FIXED', note: 'готово' }), { status: 'FIXED', note: 'готово' });
    assert.deepEqual(parseReviewPatch({ severity: 'LOW' }), { severity: 'LOW' });
    assert.match(parseReviewPatch({}) as string, /Нечего менять/u);
    assert.match(parseReviewPatch({ status: 'DONE' }) as string, /status/u);
    assert.match(parseReviewPatch({ severity: 'URGENT' }) as string, /severity/u);
    assert.match(parseReviewPatch({ note: 5 }) as string, /note/u);
    assert.match(parseReviewPatch({ note: 'а'.repeat(2001) }) as string, /2000/u);
    assert.match(parseReviewPatch({ status: 'FIXED', who: 'x' }) as string, /Неизвестные поля: who/u);
    assert.match(parseReviewPatch([]) as string, /объект/u);
    assert.match(parseReviewPatch(null) as string, /объект/u);
  });

  it('строка выгрузки: время по Москве, подписи, снимок без ключа хранилища', () => {
    const item = toExportItem(ROW);
    assert.equal(item.createdAtMsk, '2026-10-04 15:01');
    assert.equal(item.areaLabel, 'сайт');
    assert.equal(item.severityLabel, 'критично');
    assert.equal(item.statusLabel, 'новое');
    assert.deepEqual(item.screenshot, { type: 'image/png', size: 16 });
    assert.equal(item.resolvedAtMsk, null);
    assert.doesNotMatch(JSON.stringify(item), /feedback\/abc\.png/u);
  });
});

describe('ответы выгрузки', () => {
  it('без ключа на сервере — 404 и служба не вызывается', async () => {
    const { opts, calls } = options({ secret: '' });
    const res = await handleExportList(request(URL_BASE), opts);
    assert.equal(res.status, 404);
    assert.equal(calls.list.length, 0);
  });

  it('неверный или отсутствующий ключ — 404, как несуществующий адрес', async () => {
    const { opts, calls } = options();
    assert.equal((await handleExportList(request(URL_BASE, { key: 'z'.repeat(48) }), opts)).status, 404);
    assert.equal((await handleExportList(request(URL_BASE, { key: null }), opts)).status, 404);
    assert.equal((await handleExportScreenshot(request(`${URL_BASE}/fb1/screenshot`, { key: null }), 'fb1', opts)).status, 404);
    assert.equal((await handleExportReview(request(`${URL_BASE}/fb1`, { key: null, method: 'PATCH', body: '{"status":"FIXED"}' }), 'fb1', opts)).status, 404);
    assert.equal(calls.list.length + calls.shot.length + calls.review.length, 0);
  });

  it('перечень: JSON без кэша и без индексации, отбор передан службе', async () => {
    const { opts, calls } = options();
    const res = await handleExportList(request(`${URL_BASE}?status=NEW,IN_WORK`), opts);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
    const body = await res.json();
    assert.deepEqual(calls.list, [['NEW', 'IN_WORK']]);
    assert.equal(body.total, 1);
    assert.equal(body.generatedAtMsk, '2026-10-04 15:30');
    assert.equal(body.items[0].id, 'fb1');
    assert.equal(body.items[0].page, '/main');
  });

  it('частые запросы с одного адреса — 429 до проверки ключа', async () => {
    const { opts, calls } = options({ limiter: new RateLimiter({ windowMs: 60_000, limit: 2, maxKeys: 10 }) });
    assert.equal((await handleExportList(request(URL_BASE), opts)).status, 200);
    assert.equal((await handleExportList(request(URL_BASE, { key: 'z'.repeat(48) }), opts)).status, 404);
    assert.equal((await handleExportList(request(URL_BASE), opts)).status, 429);
    assert.equal(calls.list.length, 1);
  });

  it('снимок: байты с типом, без кэша; нет снимка — 404', async () => {
    const { opts } = options();
    const res = await handleExportScreenshot(request(`${URL_BASE}/fb1/screenshot`), 'fb1', opts);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    assert.equal((await res.arrayBuffer()).byteLength, 4);
    assert.equal((await handleExportScreenshot(request(`${URL_BASE}/x/screenshot`), 'x', opts)).status, 404);
  });

  it('разбор: правка принята и вернулась строкой выгрузки', async () => {
    const { opts, calls } = options();
    const res = await handleExportReview(
      request(`${URL_BASE}/fb1`, { method: 'PATCH', body: JSON.stringify({ status: 'FIXED', note: 'Исправлено' }) }),
      'fb1',
      opts,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(calls.review, [['fb1', { status: 'FIXED', note: 'Исправлено' }]]);
    assert.equal(body.item.statusLabel, 'исправлено');
    assert.equal(body.item.resolvedAtMsk, '2026-10-04 16:00');
  });

  it('разбор: кривое тело — 400, большое — 413, нет замечания — 404, отказ службы — 400', async () => {
    const { opts } = options();
    const patch = (id: string, body: string) =>
      handleExportReview(request(`${URL_BASE}/${id}`, { method: 'PATCH', body }), id, opts);
    assert.equal((await patch('fb1', 'не json')).status, 400);
    assert.equal((await patch('fb1', '{"status":"DONE"}')).status, 400);
    assert.equal((await patch('fb1', JSON.stringify({ note: 'а'.repeat(REVIEW_BODY_MAX) }))).status, 413);
    assert.equal((await patch('nope', '{"status":"FIXED"}')).status, 404);
    const failed = await patch('fb1', '{"note":"сбой"}');
    assert.equal(failed.status, 400);
    assert.match((await failed.json()).error, /2000/u);
    // Сбой базы — не отказ проверки: текст наружу не уходит.
    await assert.rejects(patch('fb1', '{"note":"база"}'), /prisma/u);
  });
});

describe('выгрузка подключена', () => {
  it('маршруты берут ключ из FEEDBACK_EXPORT_TOKEN, разбор — только PATCH', () => {
    const dir = path.join(ROOT, 'app', 'src', 'app', 'api', 'feedback', 'export');
    const list = readFileSync(path.join(dir, 'route.ts'), 'utf8');
    const review = readFileSync(path.join(dir, '[id]', 'route.ts'), 'utf8');
    const shot = readFileSync(path.join(dir, '[id]', 'screenshot', 'route.ts'), 'utf8');
    for (const source of [list, review, shot]) {
      assert.match(source, /secret: process\.env\.FEEDBACK_EXPORT_TOKEN/u);
    }
    assert.match(list, /export async function GET/u);
    assert.match(shot, /export async function GET/u);
    assert.match(review, /export async function PATCH/u);
    assert.doesNotMatch(review, /export async function (GET|POST|PUT|DELETE)/u);
  });

  it('ключ передаётся контейнеру, образец настроек его описывает', () => {
    assert.match(readFileSync(path.join(ROOT, 'deploy', 'docker-compose.yml'), 'utf8'),
      /FEEDBACK_EXPORT_TOKEN: \$\{FEEDBACK_EXPORT_TOKEN:-\}/u);
    assert.match(readFileSync(path.join(ROOT, 'app', '.env.example'), 'utf8'), /^FEEDBACK_EXPORT_TOKEN=""$/mu);
  });

  it('забранные замечания не попадают в историю', () => {
    assert.match(readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^feedback-export\/$/mu);
  });
});
