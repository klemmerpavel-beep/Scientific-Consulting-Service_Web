/**
 * Инструменты сервера (спецификация, раздел 2).
 *
 * Чтение — сразу. Изменения — только предложением: сервер сверяет его с
 * потолками конфигурации, отклоняет лишнее до показа владельцу и
 * выполняет подтверждённое кодом владельца. Удаления и платёжных операций
 * в наборе нет (принципы 3 и 4).
 */

import { directionOf } from './config.mjs';
import { MICRO } from './direct.mjs';
import { textResult } from './protocol.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOSCOW_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' });

const REPORT_FIELDS = {
  campaign: ['CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Ctr', 'Cost', 'AvgCpc'],
  day: ['Date', 'CampaignName', 'Impressions', 'Clicks', 'Cost'],
  adgroup: ['CampaignName', 'AdGroupId', 'AdGroupName', 'Impressions', 'Clicks', 'Ctr', 'Cost', 'AvgCpc'],
  keyword: ['CampaignName', 'AdGroupName', 'CriterionId', 'Criterion', 'Impressions', 'Clicks', 'Ctr', 'Cost', 'AvgCpc'],
};

function dates(args) {
  const { date_from: from, date_to: to } = args;
  if (!DATE.test(from ?? '') || !DATE.test(to ?? '')) throw new Error('date_from и date_to — даты ГГГГ-ММ-ДД');
  if (from > to) throw new Error('date_from позже date_to');
  return { from, to };
}

function ids(value, name) {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => Number.isInteger(id) && id > 0)) {
    throw new Error(`${name} — непустой список номеров`);
  }
  return value;
}

function rub(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${name} — сумма в рублях больше нуля`);
  return Math.round(value * 100) / 100;
}

/** Отчётные столбцы конверсий называются по цели и модели; сводим к одному полю. */
function normalizeRow(row) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith('Conversions')) result.Conversions = (result.Conversions ?? 0) + (value ?? 0);
    else result[key] = value;
  }
  return result;
}

function checkErrors(results, what) {
  const problems = (results ?? []).flatMap((item) => item.Errors ?? []);
  if (problems.length) {
    throw new Error(`${what}: ${problems.map((p) => `${p.Code} ${p.Message}${p.Details ? ` (${p.Details})` : ''}`).join('; ')}`);
  }
}

const RANGE = {
  date_from: { type: 'string', description: 'Начало периода, ГГГГ-ММ-ДД' },
  date_to: { type: 'string', description: 'Конец периода, ГГГГ-ММ-ДД' },
};

export function createTools({ config, direct, metrika, journal, proposals, now = () => new Date() }) {
  // Клиенты передаются фабриками и создаются при первом вызове: сервер
  // должен запускаться и без токенов, а отказ — приходить агенту с
  // понятной причиной.
  const api = () => direct();

  function read(tool, args, summary) {
    journal.append({ type: 'read', tool, args, summary });
  }

  async function campaign(campaignId) {
    const result = await api().call('campaigns', 'get', {
      SelectionCriteria: { Ids: [campaignId] },
      FieldNames: ['Id', 'Name', 'State', 'Status', 'DailyBudget', 'NegativeKeywords'],
    });
    const found = result?.Campaigns?.[0];
    if (!found) throw new Error(`Кампания ${campaignId} не найдена`);
    const direction = directionOf(found.Name);
    if (!direction) throw new Error(`Кампания ${found.Name} вне схемы имён PD_STU_/PD_PG_: предложения по ней не принимаются`);
    return { ...found, direction, limits: config.directions[direction] };
  }

  /** Фразы одной кампании: ставки и остановка по фразам не смешивают кампании. */
  async function keywordsCampaign(keywordIds) {
    const result = await api().call('keywords', 'get', {
      SelectionCriteria: { Ids: keywordIds },
      FieldNames: ['Id', 'Keyword', 'CampaignId', 'State'],
    });
    const found = result?.Keywords ?? [];
    const missing = keywordIds.filter((id) => !found.some((k) => k.Id === id));
    if (missing.length) throw new Error(`Фразы не найдены: ${missing.join(', ')}`);
    const campaigns = new Set(found.map((k) => k.CampaignId));
    if (campaigns.size !== 1) throw new Error('Фразы из разных кампаний: одно предложение — одна кампания');
    return { keywords: found, campaign: await campaign([...campaigns][0]) };
  }

  /** Расход направления за период по отчёту, рубли без НДС. */
  async function spend(direction, from, to) {
    const rows = await api().report({
      SelectionCriteria: { DateFrom: from, DateTo: to },
      FieldNames: ['CampaignName', 'Cost'],
      ReportType: 'CAMPAIGN_PERFORMANCE_REPORT',
      DateRangeType: 'CUSTOM_DATE',
    });
    return rows.filter((row) => directionOf(row.CampaignName) === direction).reduce((sum, row) => sum + (row.Cost ?? 0), 0);
  }

  /**
   * Потолки расхода месяца и недели: предложение, которое может увеличить
   * расход сверх них, отклоняется до показа владельцу (принцип 2).
   */
  async function assertSpendRoom(direction) {
    const limits = config.directions[direction];
    const today = MOSCOW_DATE.format(now());
    const monthStart = today.slice(0, 8) + '01';
    const weekStart = MOSCOW_DATE.format(new Date(now().getTime() - 6 * 86_400_000));
    const month = await spend(direction, monthStart, today);
    if (month >= limits.monthlySpendMax) {
      throw new Error(`«${limits.title}»: расход месяца ${month} ₽ достиг потолка ${limits.monthlySpendMax} ₽`);
    }
    const week = await spend(direction, weekStart, today);
    if (week >= limits.weeklySpendMax) {
      throw new Error(`«${limits.title}»: расход за 7 дней ${week} ₽ достиг потолка ${limits.weeklySpendMax} ₽`);
    }
    return { month, week };
  }

  async function propose(base, { reason }) {
    const result = await proposals.create({ ...base, directionTitle: config.directions[base.direction].title, reason });
    return textResult({ proposal: result.id, status: result.status, message: result.message, summary: base.summary, effect: base.effect });
  }

  // Применение подтверждённого: каждый вид — свой вызов API, потолки
  // проверяются заново по текущей конфигурации (владелец мог их снизить).
  const apply = {
    async negative_keywords({ campaignId, words }) {
      const current = await campaign(campaignId);
      const items = [...new Set([...(current.NegativeKeywords?.Items ?? []), ...words])];
      const result = await api().call('campaigns', 'update', { Campaigns: [{ Id: campaignId, NegativeKeywords: { Items: items } }] });
      checkErrors(result?.UpdateResults, 'Минус-слова');
      return { campaignId, negativeKeywords: items.length };
    },
    async bids({ keywordIds, bidRub }) {
      const { campaign: owner } = await keywordsCampaign(keywordIds);
      if (bidRub > owner.limits.bidMax) throw new Error(`Ставка ${bidRub} ₽ выше потолка ${owner.limits.bidMax} ₽`);
      const result = await api().call('keywordbids', 'set', {
        KeywordBids: keywordIds.map((id) => ({ KeywordId: id, SearchBid: Math.round(bidRub * MICRO) })),
      });
      checkErrors(result?.SetResults, 'Ставки');
      return { keywords: keywordIds.length, bidRub };
    },
    async budget({ campaignId, dailyRub }) {
      const current = await campaign(campaignId);
      if (dailyRub > current.limits.dailyBudgetMax) throw new Error(`Дневной бюджет ${dailyRub} ₽ выше потолка ${current.limits.dailyBudgetMax} ₽`);
      const result = await api().call('campaigns', 'update', {
        Campaigns: [{ Id: campaignId, DailyBudget: { Amount: Math.round(dailyRub * MICRO), Mode: 'STANDARD' } }],
      });
      checkErrors(result?.UpdateResults, 'Дневной бюджет');
      return { campaignId, dailyRub };
    },
    async pause({ level, ids: targets }) {
      const service = level === 'campaign' ? 'campaigns' : 'keywords';
      const result = await api().call(service, 'suspend', { SelectionCriteria: { Ids: targets } });
      checkErrors(result?.SuspendResults, 'Остановка');
      return { level, stopped: targets.length };
    },
    async resume({ level, ids: targets, direction }) {
      await assertSpendRoom(direction);
      const service = level === 'campaign' ? 'campaigns' : 'keywords';
      const result = await api().call(service, 'resume', { SelectionCriteria: { Ids: targets } });
      checkErrors(result?.ResumeResults, 'Возобновление');
      return { level, resumed: targets.length };
    },
  };

  async function pauseOrResume(kind, args) {
    const level = args.level;
    if (level !== 'campaign' && level !== 'keyword') throw new Error('level — campaign или keyword');
    const targets = ids(args.ids, 'ids');
    let owner;
    if (level === 'campaign') {
      if (targets.length !== 1) throw new Error('Одно предложение — одна кампания');
      owner = await campaign(targets[0]);
    } else {
      owner = (await keywordsCampaign(targets)).campaign;
    }
    if (kind === 'resume') await assertSpendRoom(owner.direction);
    const what = level === 'campaign' ? 'кампания целиком' : `фраз: ${targets.length}`;
    return propose(
      {
        kind,
        direction: owner.direction,
        campaignId: owner.Id,
        campaignName: owner.Name,
        change: { level, ids: targets, direction: owner.direction },
        summary: kind === 'pause' ? `остановить — ${what}` : `возобновить — ${what}`,
        effect: kind === 'pause' ? 'по остановленным объектам расход прекращается' : 'расход возобновляется в пределах дневного бюджета и потолков месяца и недели',
      },
      args,
    );
  }

  const tools = [
    {
      name: 'campaigns_list',
      description: 'Кампании Директа: состояние, дневной бюджет, направление по имени (STU — «Студентам», PG — «Аспирантам»).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async run() {
        const result = await api().call('campaigns', 'get', {
          SelectionCriteria: {},
          FieldNames: ['Id', 'Name', 'Type', 'State', 'Status', 'StartDate', 'DailyBudget'],
        });
        const rows = (result?.Campaigns ?? []).map((c) => ({
          id: c.Id,
          name: c.Name,
          type: c.Type,
          state: c.State,
          status: c.Status,
          startDate: c.StartDate,
          dailyBudgetRub: c.DailyBudget ? c.DailyBudget.Amount / MICRO : null,
          direction: directionOf(c.Name),
        }));
        read('campaigns_list', {}, `кампаний: ${rows.length}`);
        return textResult({ campaigns: rows, units: api().units() });
      },
    },
    {
      name: 'stats_report',
      description: 'Статистика Директа за период, рубли без НДС: показы, клики, CTR, расход, цена клика; конверсии по цели lead, если цель задана в конфигурации.',
      inputSchema: {
        type: 'object',
        properties: {
          ...RANGE,
          group_by: { type: 'string', enum: Object.keys(REPORT_FIELDS), description: 'Разрез: кампания, день, группа или фраза' },
        },
        required: ['date_from', 'date_to', 'group_by'],
        additionalProperties: false,
      },
      async run(args) {
        const { from, to } = dates(args);
        const fields = REPORT_FIELDS[args.group_by];
        if (!fields) throw new Error(`group_by — одно из: ${Object.keys(REPORT_FIELDS).join(', ')}`);
        const definition = {
          SelectionCriteria: { DateFrom: from, DateTo: to },
          FieldNames: config.metrika.goalId ? [...fields, 'Conversions'] : fields,
          ReportType: 'CUSTOM_REPORT',
          DateRangeType: 'CUSTOM_DATE',
        };
        if (config.metrika.goalId) {
          definition.Goals = [String(config.metrika.goalId)];
          definition.AttributionModels = ['LSCCD'];
        }
        const rows = (await api().report(definition)).map(normalizeRow);
        read('stats_report', args, `строк: ${rows.length}`);
        return textResult({ period: { from, to }, groupBy: args.group_by, rows, units: api().units() });
      },
    },
    {
      name: 'search_queries',
      description: 'Фактические поисковые запросы с показами, кликами и расходом — основа для минус-слов.',
      inputSchema: {
        type: 'object',
        properties: { ...RANGE, campaign_ids: { type: 'array', items: { type: 'integer' }, description: 'Только эти кампании' } },
        required: ['date_from', 'date_to'],
        additionalProperties: false,
      },
      async run(args) {
        const { from, to } = dates(args);
        const criteria = { DateFrom: from, DateTo: to };
        if (args.campaign_ids) criteria.Filter = [{ Field: 'CampaignId', Operator: 'IN', Values: ids(args.campaign_ids, 'campaign_ids').map(String) }];
        const rows = await api().report({
          SelectionCriteria: criteria,
          FieldNames: ['Query', 'CampaignName', 'AdGroupName', 'Impressions', 'Clicks', 'Cost'],
          ReportType: 'SEARCH_QUERY_PERFORMANCE_REPORT',
          DateRangeType: 'CUSTOM_DATE',
        });
        read('search_queries', args, `запросов: ${rows.length}`);
        return textResult({ period: { from, to }, rows, units: api().units() });
      },
    },
    {
      name: 'goal_conversions',
      description: 'Метрика: визиты и достижения цели lead по меткам utm и странице входа. Видит только согласившихся на статистику.',
      inputSchema: { type: 'object', properties: RANGE, required: ['date_from', 'date_to'], additionalProperties: false },
      async run(args) {
        const { from, to } = dates(args);
        const rows = await metrika().goalConversions({ goalId: config.metrika.goalId, attribution: config.metrika.attribution, dateFrom: from, dateTo: to });
        read('goal_conversions', args, `строк: ${rows.length}`);
        return textResult({ period: { from, to }, rows });
      },
    },
    {
      name: 'proposals_list',
      description: 'Предложения и их состояние: waiting — ждёт кода владельца, applied, failed, expired, locked, no_channel.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async run() {
        return textResult({ proposals: proposals.list() });
      },
    },
    {
      name: 'propose_negative_keywords',
      description: 'Предложить минус-слова кампании по отчёту о поисковых запросах. Применяется только с кодом владельца.',
      inputSchema: {
        type: 'object',
        properties: {
          campaign_id: { type: 'integer' },
          words: { type: 'array', items: { type: 'string' }, description: 'Минус-слова или минус-фразы' },
          reason: { type: 'string', description: 'Какие запросы и почему отсекаются' },
        },
        required: ['campaign_id', 'words', 'reason'],
        additionalProperties: false,
      },
      async run(args) {
        const words = (args.words ?? []).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
        if (words.length === 0) throw new Error('words — хотя бы одно слово');
        const owner = await campaign(args.campaign_id);
        const existing = new Set(owner.NegativeKeywords?.Items ?? []);
        const added = [...new Set(words)].filter((w) => !existing.has(w));
        if (added.length === 0) throw new Error('Все слова уже есть в минус-словах кампании');
        return propose(
          {
            kind: 'negative_keywords',
            direction: owner.direction,
            campaignId: owner.Id,
            campaignName: owner.Name,
            change: { campaignId: owner.Id, words: added },
            summary: `минус-слова +${added.length}: ${added.join(', ')}`,
            effect: 'не растёт: минус-слова сужают показы',
          },
          args,
        );
      },
    },
    {
      name: 'propose_bids',
      description: 'Предложить ставку для фраз одной кампании, рубли. Выше потолка направления не принимается.',
      inputSchema: {
        type: 'object',
        properties: {
          keyword_ids: { type: 'array', items: { type: 'integer' } },
          bid_rub: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['keyword_ids', 'bid_rub', 'reason'],
        additionalProperties: false,
      },
      async run(args) {
        const keywordIds = ids(args.keyword_ids, 'keyword_ids');
        const bidRub = rub(args.bid_rub, 'bid_rub');
        const { campaign: owner } = await keywordsCampaign(keywordIds);
        if (bidRub > owner.limits.bidMax) throw new Error(`Ставка ${bidRub} ₽ выше потолка «${owner.limits.title}» ${owner.limits.bidMax} ₽`);
        return propose(
          {
            kind: 'bids',
            direction: owner.direction,
            campaignId: owner.Id,
            campaignName: owner.Name,
            change: { keywordIds, bidRub },
            summary: `ставка ${bidRub} ₽ для фраз: ${keywordIds.length}`,
            effect: `может вырасти в пределах дневного бюджета; потолок ставки ${owner.limits.bidMax} ₽`,
          },
          args,
        );
      },
    },
    {
      name: 'propose_budget',
      description: 'Предложить дневной бюджет кампании, рубли без НДС. Выше потолка направления и при исчерпанном расходе месяца или недели не принимается.',
      inputSchema: {
        type: 'object',
        properties: { campaign_id: { type: 'integer' }, daily_rub: { type: 'number' }, reason: { type: 'string' } },
        required: ['campaign_id', 'daily_rub', 'reason'],
        additionalProperties: false,
      },
      async run(args) {
        const dailyRub = rub(args.daily_rub, 'daily_rub');
        const owner = await campaign(args.campaign_id);
        if (dailyRub > owner.limits.dailyBudgetMax) throw new Error(`Дневной бюджет ${dailyRub} ₽ выше потолка «${owner.limits.title}» ${owner.limits.dailyBudgetMax} ₽`);
        const before = owner.DailyBudget ? owner.DailyBudget.Amount / MICRO : null;
        if (before === null || dailyRub > before) await assertSpendRoom(owner.direction);
        return propose(
          {
            kind: 'budget',
            direction: owner.direction,
            campaignId: owner.Id,
            campaignName: owner.Name,
            change: { campaignId: owner.Id, dailyRub },
            summary: `дневной бюджет ${before ?? 'не задан'} → ${dailyRub} ₽`,
            effect: before !== null && dailyRub <= before ? 'не растёт' : `может вырасти до ${dailyRub} ₽ в день`,
          },
          args,
        );
      },
    },
    {
      name: 'propose_pause',
      description: 'Предложить остановку кампании или фраз одной кампании.',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['campaign', 'keyword'] },
          ids: { type: 'array', items: { type: 'integer' } },
          reason: { type: 'string' },
        },
        required: ['level', 'ids', 'reason'],
        additionalProperties: false,
      },
      run: (args) => pauseOrResume('pause', args),
    },
    {
      name: 'propose_resume',
      description: 'Предложить возобновление кампании или фраз одной кампании. При исчерпанном расходе месяца или недели не принимается.',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['campaign', 'keyword'] },
          ids: { type: 'array', items: { type: 'integer' } },
          reason: { type: 'string' },
        },
        required: ['level', 'ids', 'reason'],
        additionalProperties: false,
      },
      run: (args) => pauseOrResume('resume', args),
    },
    {
      name: 'apply_confirmed',
      description: 'Применить предложение по коду владельца. Код приходит владельцу в Telegram; без кода от владельца не вызывать.',
      inputSchema: {
        type: 'object',
        properties: { proposal_id: { type: 'string' }, code: { type: 'string', description: 'Шесть цифр от владельца' } },
        required: ['proposal_id', 'code'],
        additionalProperties: false,
      },
      async run(args) {
        if (!config.write) throw new Error('Запись выключена в конфигурации (write: false): применить нельзя');
        const proposal = proposals.verify(args.proposal_id, args.code);
        const action = apply[proposal.kind];
        if (!action) throw new Error(`Вид ${proposal.kind} в каркасе не применяется`);
        try {
          const result = await action(proposal.change);
          proposals.markApplied(proposal.id, result);
          return textResult({ proposal: proposal.id, applied: true, result });
        } catch (error) {
          proposals.markFailed(proposal.id, error.message);
          throw error;
        }
      },
    },
  ];

  return tools;
}
