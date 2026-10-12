import assert from 'node:assert/strict';
import { test } from 'node:test';

import { directionOf, validateConfig } from '../lib/config.mjs';
import { createDirect, DirectError, parseTsv, reportName } from '../lib/direct.mjs';
import { createMetrika } from '../lib/metrika.mjs';
import { EXAMPLE } from './helpers.mjs';

function recorder(responses) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    const next = responses.shift();
    return typeof next === 'function' ? next() : next;
  };
  return { requests, fetchImpl };
}

test('образец конфигурации проходит проверку, запись и остановка по порогу выключены', () => {
  const config = validateConfig(EXAMPLE);
  assert.equal(config.write, false);
  assert.equal(config.sandbox, true);
  assert.equal(config.apiVersion, 'v501');
  assert.equal(config.metrika.attribution, 'last');
  assert.equal(config.directions.STU.bidMax, 165);
  assert.equal(config.directions.PG.monthlySpendMax, 8197);
});

test('конфигурация отказывает с названием поля', () => {
  assert.throws(() => validateConfig({ ...EXAMPLE, directions: { STU: EXAMPLE.directions.STU } }), /directions\.PG/);
  assert.throws(() => validateConfig({ ...EXAMPLE, directions: { ...EXAMPLE.directions, STU: { ...EXAMPLE.directions.STU, bidMax: 0 } } }), /bidMax/);
  assert.throws(() => validateConfig({ ...EXAMPLE, autoStop: { enabled: true } }), /autoStop/);
  assert.throws(() => validateConfig({ ...EXAMPLE, apiVersion: 'v4' }), /apiVersion/);
});

test('направление — по схеме имён кампаний', () => {
  assert.equal(directionOf('PD_STU_SRCH_MSK-SPB_C_v1'), 'STU');
  assert.equal(directionOf('PD_PG_SRCH_MSK-SPB_AB_v1'), 'PG');
  assert.equal(directionOf('PD_BIZ_SRCH_MSK_A_v1'), null);
  assert.equal(directionOf('Кампания'), null);
});

test('TSV: числа — числами, «--» — пусто', () => {
  const rows = parseTsv('CampaignName\tClicks\tCost\tAvgCpc\nPD_STU\t12\t1530.5\t--\n');
  assert.deepEqual(rows, [{ CampaignName: 'PD_STU', Clicks: 12, Cost: 1530.5, AvgCpc: null }]);
  assert.deepEqual(parseTsv(''), []);
});

test('имя отчёта зависит от определения, но не от прежнего имени', () => {
  const a = reportName({ ReportType: 'CUSTOM_REPORT', FieldNames: ['Clicks'] });
  assert.equal(a, reportName({ ReportType: 'CUSTOM_REPORT', FieldNames: ['Clicks'], ReportName: 'x' }));
  assert.notEqual(a, reportName({ ReportType: 'CUSTOM_REPORT', FieldNames: ['Cost'] }));
});

test('вызов сервиса: песочница, токен, логин клиента, баллы', async () => {
  const { requests, fetchImpl } = recorder([
    new Response(JSON.stringify({ result: { Campaigns: [] } }), { status: 200, headers: { Units: '25/19975/20000' } }),
  ]);
  const direct = createDirect({ token: 't0k', clientLogin: 'rusdron', fetchImpl });
  assert.deepEqual(await direct.call('campaigns', 'get', { SelectionCriteria: {} }), { Campaigns: [] });
  assert.equal(requests[0].url, 'https://api-sandbox.direct.yandex.com/json/v501/campaigns');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer t0k');
  assert.equal(requests[0].init.headers['Client-Login'], 'rusdron');
  assert.deepEqual(JSON.parse(requests[0].init.body), { method: 'get', params: { SelectionCriteria: {} } });
  assert.equal(direct.units(), '25/19975/20000');
});

test('ошибка Директа в теле ответа — DirectError с кодом', async () => {
  const { fetchImpl } = recorder([
    new Response(JSON.stringify({ error: { error_code: 53, error_string: 'Ошибка авторизации', error_detail: 'токен' } }), { status: 200 }),
  ]);
  const direct = createDirect({ token: 't', sandbox: false, fetchImpl });
  await assert.rejects(direct.call('campaigns', 'get', {}), (error) => error instanceof DirectError && error.code === 53);
});

test('без токена клиент не создаётся', () => {
  assert.throws(() => createDirect({ token: '' }), /DIRECT_TOKEN/);
});

test('отчёт: очередь 201 и 202, ожидание retryIn, затем TSV в рублях без НДС', async () => {
  const { requests, fetchImpl } = recorder([
    new Response('', { status: 201, headers: { retryIn: '2' } }),
    new Response('', { status: 202, headers: { retryIn: '3' } }),
    new Response('CampaignName\tCost\nPD_STU\t100\n', { status: 200 }),
  ]);
  const waits = [];
  const direct = createDirect({ token: 't', fetchImpl, sleep: async (ms) => waits.push(ms), version: 'v5' });
  const rows = await direct.report({ ReportType: 'CAMPAIGN_PERFORMANCE_REPORT', FieldNames: ['CampaignName', 'Cost'] });
  assert.deepEqual(rows, [{ CampaignName: 'PD_STU', Cost: 100 }]);
  assert.deepEqual(waits, [2000, 3000]);
  assert.equal(requests[0].url, 'https://api-sandbox.direct.yandex.com/json/v5/reports');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.params.IncludeVAT, 'NO');
  assert.equal(body.params.Format, 'TSV');
  assert.match(body.params.ReportName, /^pd-[0-9a-f]{16}$/);
  assert.equal(requests[0].init.headers.returnMoneyInMicros, 'false');
});

test('отчёт, не готовый за отведённое время, — отказ, а не бесконечное ожидание', async () => {
  const { fetchImpl } = recorder([() => new Response('', { status: 202, headers: { retryIn: '60' } })]);
  const direct = createDirect({ token: 't', fetchImpl, sleep: async () => {}, maxWaitMs: 30_000 });
  await assert.rejects(direct.report({ ReportType: 'CUSTOM_REPORT' }), /не готов/);
});

test('Метрика: цель lead по меткам и странице входа', async () => {
  const { requests, fetchImpl } = recorder([
    new Response(
      JSON.stringify({ data: [{ dimensions: [{ name: 'yandex' }, { name: '101' }, { name: '/students' }], metrics: [40, 2] }] }),
      { status: 200 },
    ),
  ]);
  const metrika = createMetrika({ token: 'm', counterId: 12345678, fetchImpl });
  const rows = await metrika.goalConversions({ goalId: 987, attribution: 'last', dateFrom: '2026-10-27', dateTo: '2026-11-02' });
  assert.deepEqual(rows, [{ utmSource: 'yandex', utmCampaign: '101', landing: '/students', visits: 40, leads: 2 }]);
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get('metrics'), 'ym:s:visits,ym:s:goal987reaches');
  assert.equal(url.searchParams.get('dimensions'), 'ym:s:lastUTMSource,ym:s:lastUTMCampaign,ym:s:startURLPath');
  assert.equal(requests[0].init.headers.Authorization, 'OAuth m');
  await assert.rejects(createMetrika({ token: 'm', counterId: null }).goalConversions({ goalId: 1, dateFrom: 'a', dateTo: 'b' }), /counterId/);
});
