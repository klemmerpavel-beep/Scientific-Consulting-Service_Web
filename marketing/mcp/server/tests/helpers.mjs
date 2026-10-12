/** Общие заглушки проверок: конфигурация, журнал во временном каталоге, API без сети. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateConfig } from '../lib/config.mjs';
import { createJournal } from '../lib/journal.mjs';

export const EXAMPLE = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'config.example.json'), 'utf8'));

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pd-mcp-'));
}

export function makeConfig(overrides = {}) {
  const dir = tempDir();
  return validateConfig({ ...EXAMPLE, ...overrides, journal: path.join(dir, 'journal.jsonl') });
}

export function makeJournal(config, now) {
  return createJournal(config.journal, { now });
}

/** Telegram-заглушка: складывает сообщения, код достаётся из последнего. */
export function fakeTelegram() {
  const sent = [];
  return {
    sent,
    async send(text) {
      sent.push(text);
    },
    lastCode() {
      const match = /Код подтверждения: (\d{6})/.exec(sent.at(-1) ?? '');
      return match?.[1];
    },
  };
}

/**
 * Директ-заглушка: кампании и фразы в памяти, вызовы записываются.
 * `spend` — расход по имени кампании для отчётов о потолках.
 */
export function fakeDirect({ campaigns = [], keywords = [], spend = {} } = {}) {
  const calls = [];
  const reports = [];
  return {
    calls,
    reports,
    campaigns,
    async call(service, method, params) {
      calls.push({ service, method, params });
      if (service === 'campaigns' && method === 'get') {
        const wanted = params.SelectionCriteria?.Ids;
        return { Campaigns: campaigns.filter((c) => !wanted || wanted.includes(c.Id)) };
      }
      if (service === 'keywords' && method === 'get') {
        return { Keywords: keywords.filter((k) => params.SelectionCriteria.Ids.includes(k.Id)) };
      }
      if (method === 'update') return { UpdateResults: params.Campaigns.map((c) => ({ Id: c.Id })) };
      if (method === 'set') return { SetResults: params.KeywordBids.map((k) => ({ KeywordId: k.KeywordId })) };
      if (method === 'suspend') return { SuspendResults: params.SelectionCriteria.Ids.map((Id) => ({ Id })) };
      if (method === 'resume') return { ResumeResults: params.SelectionCriteria.Ids.map((Id) => ({ Id })) };
      throw new Error(`заглушка не знает ${service}.${method}`);
    },
    async report(definition) {
      reports.push(definition);
      if (definition.ReportType === 'CAMPAIGN_PERFORMANCE_REPORT') {
        return Object.entries(spend).map(([CampaignName, Cost]) => ({ CampaignName, Cost }));
      }
      return [];
    },
    units: () => '10/20000/20000',
  };
}

export const STU_CAMPAIGN = {
  Id: 101,
  Name: 'PD_STU_SRCH_MSK-SPB_C_v1',
  State: 'ON',
  Status: 'ACCEPTED',
  DailyBudget: { Amount: 190_000_000, Mode: 'STANDARD' },
  NegativeKeywords: { Items: ['купить', 'реферат'] },
};

export const PG_CAMPAIGN = {
  Id: 202,
  Name: 'PD_PG_SRCH_MSK-SPB_AB_v1',
  State: 'ON',
  Status: 'ACCEPTED',
  DailyBudget: { Amount: 300_000_000, Mode: 'STANDARD' },
  NegativeKeywords: { Items: [] },
};

export const FOREIGN_CAMPAIGN = { Id: 303, Name: 'Старая кампания', State: 'OFF', Status: 'ACCEPTED' };

export function parse(result) {
  return JSON.parse(result.content[0].text);
}
