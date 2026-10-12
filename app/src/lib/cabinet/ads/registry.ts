/**
 * Реклама в кабинете руководителя (решение Р-550): типы реестра и расчёты
 * сводки.
 *
 * Реестр ведётся в `marketing/registry.json` репозитория и переносится в
 * `app/content/ads-registry.generated.ts` скриптом `tools/ads-registry.mjs`.
 * Расход, показы и клики кампаний до подключения API Директа вносятся в
 * реестр по недельному отчёту; заявки считаются по базе кабинета
 * (`funnel.ts`). Модуль чистый: проверяется без базы.
 */

export type CampaignStatus = 'DRAFT' | 'MODERATION' | 'ACTIVE' | 'PAUSED' | 'FINISHED';
export type WorkStatus = 'DONE' | 'IN_PROGRESS' | 'WAITING_OWNER' | 'PLANNED';
export type ServiceStatus = 'NOT_CONNECTED' | 'REQUESTED' | 'READ_ONLY' | 'ACTIVE' | 'ERROR' | 'NOT_PLANNED';
export type Confidence = 'sure' | 'likely' | 'risky';
export type AdsDirection = 'students' | 'postgrad';

export interface AdsCampaign {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly direction: AdsDirection | string;
  readonly status: CampaignStatus | string;
  readonly from: string;
  readonly to: string;
  /** Рубли без НДС: так суммы показывают кабинеты площадок. */
  readonly budgetPlan: number;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  /** Достижения цели `lead` по данным Метрики. */
  readonly leads: number;
  readonly doc: string | null;
  readonly note: string | null;
}

export interface AdsWeek {
  readonly week: string;
  readonly campaign: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly leads: number;
}

export interface AdsConclusion {
  readonly date: string;
  readonly confidence: Confidence | string;
  readonly text: string;
  readonly basis: string;
  readonly doc: string | null;
}

export interface AdsProposal {
  readonly id: string;
  readonly date: string;
  readonly direction: AdsDirection | 'all' | string;
  readonly title: string;
  readonly basis: string;
  readonly effect: string;
  readonly doc: string | null;
}

export interface AdsWork {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly due: string | null;
  readonly status: WorkStatus | string;
  readonly doc: string | null;
}

export interface AdsService {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly status: ServiceStatus | string;
  readonly mode: string | null;
  readonly next: string | null;
  readonly updated: string;
}

export interface AdsDoc {
  readonly slug: string;
  readonly title: string;
  readonly group: string;
  readonly path: string;
  readonly markdown: string;
}

export interface AdsRegistry {
  readonly updated: string;
  readonly test: {
    readonly from: string;
    readonly to: string;
    /** Бюджет теста по двум направлениям, рубли с НДС. */
    readonly budgetWithVat: number;
    readonly vatRate: number;
    /** Сколько дней до старта считается базовым уровнем заявок. */
    readonly baselineDays: number;
  };
  readonly campaigns: readonly AdsCampaign[];
  readonly weeks: readonly AdsWeek[];
  readonly conclusions: readonly AdsConclusion[];
  readonly proposals: readonly AdsProposal[];
  readonly works: readonly AdsWork[];
  readonly services: readonly AdsService[];
  readonly docs: readonly AdsDoc[];
}

export const DIRECTION_LABEL: Readonly<Record<string, string>> = {
  students: 'Студентам',
  postgrad: 'Аспирантам',
  all: 'Оба направления',
};

/** Страница сайта, на которую ведёт реклама направления, — `Lead.source`. */
export const DIRECTION_SOURCE: Readonly<Record<AdsDirection, string>> = {
  students: 'students',
  postgrad: 'postgrad',
};

export const CAMPAIGN_STATUS_LABEL: Readonly<Record<CampaignStatus, string>> = {
  DRAFT: 'Подготовлена',
  MODERATION: 'На модерации',
  ACTIVE: 'Идут показы',
  PAUSED: 'Остановлена',
  FINISHED: 'Завершена',
};

export const WORK_STATUS_LABEL: Readonly<Record<WorkStatus, string>> = {
  DONE: 'Сделано',
  IN_PROGRESS: 'В работе',
  WAITING_OWNER: 'Ждёт владельца',
  PLANNED: 'Впереди',
};

export const SERVICE_STATUS_LABEL: Readonly<Record<ServiceStatus, string>> = {
  NOT_CONNECTED: 'Не подключён',
  REQUESTED: 'Доступ запрошен',
  READ_ONLY: 'Только чтение',
  ACTIVE: 'Работает',
  ERROR: 'Сбой',
  NOT_PLANNED: 'Не планируется',
};

export const CONFIDENCE_LABEL: Readonly<Record<Confidence, string>> = {
  sure: 'подтверждено числами',
  likely: 'вероятно',
  risky: 'под вопросом',
};

/** Подпись значения из перечня; незнакомое показывается как есть. */
export function labelOf(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value;
}

/** Ключ отметки предложения в общем механизме отметок рекомендаций. */
export function proposalKey(id: string): string {
  return `ads:${id}`;
}

export interface CampaignFigures {
  readonly budgetPlan: number;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly leads: number;
  /** Доля освоения плана, 0–1; `null` — плана нет. */
  readonly spent: number | null;
  /** CTR, доля; `null` — показов нет. */
  readonly ctr: number | null;
  /** Цена клика, рубли; `null` — кликов нет. */
  readonly cpc: number | null;
  /** Цена достижения цели по Метрике, рубли; `null` — целей нет. */
  readonly cpl: number | null;
}

/** Показатели кампании или суммы кампаний. */
export function figures(rows: readonly Pick<AdsCampaign, 'budgetPlan' | 'spend' | 'impressions' | 'clicks' | 'leads'>[]): CampaignFigures {
  const sum = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((acc, row) => acc + pick(row), 0);
  const budgetPlan = sum((row) => row.budgetPlan);
  const spend = sum((row) => row.spend);
  const impressions = sum((row) => row.impressions);
  const clicks = sum((row) => row.clicks);
  const leads = sum((row) => row.leads);
  return {
    budgetPlan,
    spend,
    impressions,
    clicks,
    leads,
    spent: budgetPlan > 0 ? spend / budgetPlan : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpl: leads > 0 ? spend / leads : null,
  };
}

/** Бюджет теста без НДС, рубли. */
export function budgetWithoutVat(registry: Pick<AdsRegistry, 'test'>): number {
  return registry.test.budgetWithVat / (1 + registry.test.vatRate);
}

/** Начало московского дня `ГГГГ-ММ-ДД` как момент времени. */
export function moscowDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export type TestPhase = 'before' | 'running' | 'after';

/** Где сегодня относительно периода теста и какой это день теста. */
export function testPhase(registry: Pick<AdsRegistry, 'test'>, now: Date): { phase: TestPhase; day: number; days: number } {
  const from = moscowDayStart(registry.test.from).getTime();
  const end = moscowDayStart(registry.test.to).getTime() + 86_400_000;
  const days = Math.round((end - from) / 86_400_000);
  if (now.getTime() < from) return { phase: 'before', day: 0, days };
  if (now.getTime() >= end) return { phase: 'after', day: days, days };
  return { phase: 'running', day: Math.floor((now.getTime() - from) / 86_400_000) + 1, days };
}

/** Работы, которые ещё не сделаны, по сроку; без срока — в конце. */
export function openWorks(works: readonly AdsWork[]): AdsWork[] {
  return works
    .filter((work) => work.status !== 'DONE')
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.id.localeCompare(b.id));
}

/** Расход по неделям: сумма кампаний за неделю, по возрастанию даты. */
export function spendByWeek(weeks: readonly AdsWeek[]): { week: string; spend: number; clicks: number; leads: number }[] {
  const map = new Map<string, { week: string; spend: number; clicks: number; leads: number }>();
  for (const row of weeks) {
    const item = map.get(row.week) ?? { week: row.week, spend: 0, clicks: 0, leads: 0 };
    item.spend += row.spend;
    item.clicks += row.clicks;
    item.leads += row.leads;
    map.set(row.week, item);
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Документ по пути относительно папки `marketing/`, если он есть в реестре. */
export function docByPath(docs: readonly AdsDoc[], from: string, href: string): AdsDoc | null {
  const clean = href.split('#')[0] ?? '';
  if (!clean.endsWith('.md')) return null;
  const parts = from.split('/').slice(0, -1);
  for (const part of clean.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  const target = parts.join('/');
  return docs.find((doc) => doc.path === target) ?? null;
}
