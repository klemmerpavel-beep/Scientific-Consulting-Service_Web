import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { createProposals } from '../lib/proposals.mjs';
import { createTools } from '../lib/tools.mjs';
import {
  fakeDirect,
  fakeTelegram,
  FOREIGN_CAMPAIGN,
  makeConfig,
  makeJournal,
  parse,
  PG_CAMPAIGN,
  STU_CAMPAIGN,
} from './helpers.mjs';

const NOW = new Date('2026-11-05T09:00:00Z');

function setup({ write = true, telegram = fakeTelegram(), direct = fakeDirect({ campaigns: [STU_CAMPAIGN, PG_CAMPAIGN, FOREIGN_CAMPAIGN] }), now = () => NOW, codes } = {}) {
  const config = makeConfig({ write });
  const journal = makeJournal(config, now);
  const sequence = codes ? [...codes] : null;
  const proposals = createProposals({ journal, config, telegram, now, randomCode: sequence ? () => sequence.shift() : undefined });
  const tools = createTools({ config, direct: () => direct, metrika: () => ({ goalConversions: async () => [] }), journal, proposals, now });
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
  return { config, journal, proposals, tools: byName, direct, telegram };
}

async function call(tools, name, args) {
  return parse(await tools[name].run(args));
}

test('минус-слова: код уходит владельцу, агент получает только номер', async () => {
  const { tools, telegram, journal } = setup({ codes: ['482193'] });
  const result = await call(tools, 'propose_negative_keywords', { campaign_id: 101, words: ['Курсовая', 'купить', 'автор24'], reason: 'запросы о покупке' });
  assert.equal(result.proposal, 'pr-0001');
  assert.equal(result.status, 'waiting');
  assert.equal(result.summary, 'минус-слова +2: курсовая, автор24');
  assert.ok(!JSON.stringify(result).includes('482193'), 'код не попадает к агенту');
  assert.match(telegram.sent[0], /PD_STU_SRCH_MSK-SPB_C_v1 \(Студентам\)/);
  assert.equal(telegram.lastCode(), '482193');
  const log = fs.readFileSync(journal.file, 'utf8');
  assert.ok(!log.includes('482193'), 'код не попадает в журнал');
});

test('применение: неверный код — попытка, верный — изменение, повтор — отказ', async () => {
  const { tools, direct, telegram } = setup({ codes: ['111222'] });
  await call(tools, 'propose_negative_keywords', { campaign_id: 101, words: ['курсовая'], reason: 'r' });
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: '000000' }), /код не подходит/);
  const applied = await call(tools, 'apply_confirmed', { proposal_id: 'pr-0001', code: telegram.lastCode() });
  assert.equal(applied.applied, true);
  const update = direct.calls.find((c) => c.method === 'update');
  assert.deepEqual(update.params.Campaigns[0].NegativeKeywords.Items, ['купить', 'реферат', 'курсовая']);
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: '111222' }), /уже применено/);
  const listed = await call(tools, 'proposals_list', {});
  assert.equal(listed.proposals[0].status, 'applied');
  assert.equal(listed.proposals[0].attempts, 1);
  assert.equal(listed.proposals[0].hash, undefined);
});

test('при выключенной записи код не тратится и ничего не меняется', async () => {
  const { tools, direct, telegram } = setup({ write: false, codes: ['123456'] });
  await call(tools, 'propose_negative_keywords', { campaign_id: 101, words: ['эссе'], reason: 'r' });
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: telegram.lastCode() }), /write: false/);
  assert.ok(!direct.calls.some((c) => c.method === 'update'));
});

test('пять неверных кодов блокируют предложение', async () => {
  const { tools, telegram } = setup({ codes: ['654321'] });
  await call(tools, 'propose_negative_keywords', { campaign_id: 101, words: ['эссе'], reason: 'r' });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: '000001' }), /не подходит/);
  }
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: telegram.lastCode() }), /заблокировано/);
});

test('срок кода истекает', async () => {
  let moment = NOW;
  const { tools, telegram } = setup({ now: () => moment, codes: ['777888'] });
  await call(tools, 'propose_negative_keywords', { campaign_id: 101, words: ['эссе'], reason: 'r' });
  moment = new Date(NOW.getTime() + 73 * 3_600_000);
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: telegram.lastCode() }), /срок кода истёк/);
});

test('без канала владельца предложение записывается, применить нельзя', async () => {
  const { tools } = setup({ telegram: null });
  const result = await call(tools, 'propose_negative_keywords', { campaign_id: 101, words: ['эссе'], reason: 'r' });
  assert.equal(result.status, 'no_channel');
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: 'pr-0001', code: '123456' }), /канал владельца/);
});

test('ставка выше потолка направления отклоняется до показа владельцу', async () => {
  const direct = fakeDirect({
    campaigns: [STU_CAMPAIGN, PG_CAMPAIGN],
    keywords: [
      { Id: 1, Keyword: 'сопровождение вкр', CampaignId: 101 },
      { Id: 2, Keyword: 'сопровождение диссертации', CampaignId: 202 },
    ],
  });
  const { tools, telegram } = setup({ direct });
  await assert.rejects(tools.propose_bids.run({ keyword_ids: [1], bid_rub: 200, reason: 'r' }), /выше потолка «Студентам» 165/);
  await assert.rejects(tools.propose_bids.run({ keyword_ids: [1, 2], bid_rub: 100, reason: 'r' }), /разных кампаний/);
  assert.equal(telegram.sent.length, 0);
  const ok = await call(tools, 'propose_bids', { keyword_ids: [2], bid_rub: 360, reason: 'мало показов' });
  assert.equal(ok.status, 'waiting');
  await call(tools, 'apply_confirmed', { proposal_id: ok.proposal, code: telegram.lastCode() });
  const set = direct.calls.find((c) => c.method === 'set');
  assert.deepEqual(set.params.KeywordBids, [{ KeywordId: 2, SearchBid: 360_000_000 }]);
});

test('потолок снижен после предложения — применение отказывает', async () => {
  const direct = fakeDirect({ campaigns: [STU_CAMPAIGN], keywords: [{ Id: 1, Keyword: 'вкр', CampaignId: 101 }] });
  const { tools, telegram, config } = setup({ direct });
  const ok = await call(tools, 'propose_bids', { keyword_ids: [1], bid_rub: 150, reason: 'r' });
  config.directions.STU.bidMax = 120;
  await assert.rejects(tools.apply_confirmed.run({ proposal_id: ok.proposal, code: telegram.lastCode() }), /выше потолка/);
  assert.equal((await call(tools, 'proposals_list', {})).proposals[0].status, 'failed');
});

test('кампания вне схемы имён не принимается', async () => {
  const { tools } = setup();
  await assert.rejects(tools.propose_negative_keywords.run({ campaign_id: 303, words: ['x'], reason: 'r' }), /вне схемы имён/);
});

test('дневной бюджет: выше потолка — отказ; рост при исчерпанном расходе месяца — отказ', async () => {
  const direct = fakeDirect({ campaigns: [STU_CAMPAIGN], spend: { 'PD_STU_SRCH_MSK-SPB_C_v1': 5400 } });
  const { tools } = setup({ direct });
  await assert.rejects(tools.propose_budget.run({ campaign_id: 101, daily_rub: 400, reason: 'r' }), /выше потолка/);
  await assert.rejects(tools.propose_budget.run({ campaign_id: 101, daily_rub: 250, reason: 'r' }), /расход месяца 5400 ₽ достиг потолка 5330/);
  const lower = await call(tools, 'propose_budget', { campaign_id: 101, daily_rub: 150, reason: 'экономия' });
  assert.equal(lower.summary, 'дневной бюджет 190 → 150 ₽');
  assert.equal(lower.effect, 'не растёт');
});

test('возобновление при исчерпанном расходе недели — отказ; остановка — без проверки расхода', async () => {
  const direct = fakeDirect({ campaigns: [PG_CAMPAIGN], spend: { 'PD_PG_SRCH_MSK-SPB_AB_v1': 2100 } });
  const { tools, telegram } = setup({ direct });
  await assert.rejects(tools.propose_resume.run({ level: 'campaign', ids: [202], reason: 'r' }), /за 7 дней/);
  const pause = await call(tools, 'propose_pause', { level: 'campaign', ids: [202], reason: 'дорогие клики' });
  await call(tools, 'apply_confirmed', { proposal_id: pause.proposal, code: telegram.lastCode() });
  assert.ok(direct.calls.some((c) => c.service === 'campaigns' && c.method === 'suspend'));
});

test('отчёт: разрез, рубли без НДС, конверсии при заданной цели; чтение пишется в журнал', async () => {
  const direct = fakeDirect({ campaigns: [STU_CAMPAIGN] });
  direct.report = async (definition) => {
    direct.reports.push(definition);
    return [{ CampaignName: 'PD_STU', Clicks: 3, Conversions_987_LSC: 1 }];
  };
  const config = makeConfig({ metrika: { counterId: 1, goalId: 987 } });
  const journal = makeJournal(config, () => NOW);
  const proposals = createProposals({ journal, config, telegram: null, now: () => NOW });
  const tools = Object.fromEntries(createTools({ config, direct: () => direct, metrika: () => null, journal, proposals, now: () => NOW }).map((t) => [t.name, t]));
  const result = parse(await tools.stats_report.run({ date_from: '2026-10-27', date_to: '2026-11-02', group_by: 'campaign' }));
  assert.deepEqual(result.rows, [{ CampaignName: 'PD_STU', Clicks: 3, Conversions: 1 }]);
  assert.deepEqual(direct.reports[0].Goals, ['987']);
  assert.ok(direct.reports[0].FieldNames.includes('Conversions'));
  await assert.rejects(tools.stats_report.run({ date_from: '2026-11-02', date_to: '2026-10-27', group_by: 'day' }), /позже/);
  assert.equal(journal.read().filter((e) => e.type === 'read').length, 1);
});
