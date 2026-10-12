import { redirect } from 'next/navigation';

import { ADS_REGISTRY } from '../../../../../content/ads-registry.generated';
import ActionError from '../../../../components/cabinet/ActionError';
import { adsDocHref } from '../../../../components/cabinet/AdsDocument';
import { BarChart } from '../../../../components/cabinet/Charts';
import RecommendationMarks, { RecommendationCard, assignHref } from '../../../../components/cabinet/RecommendationMarks';
import Shell from '../../../../components/cabinet/Shell';
import {
  ButtonLink,
  Card,
  Chip,
  Heading,
  Mono,
  Notice,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableScroll,
  Tabs,
  Text,
  Tile,
  Tiles,
  plural,
} from '../../../../components/cabinet/ui';
import { RADIUS } from '../../../../components/cabinet/tokens';
import { can } from '../../../../lib/cabinet/access';
import { sourceFunnels } from '../../../../lib/cabinet/ads/funnel';
import { funnelRows } from '../../../../lib/cabinet/ads/funnel-rows';
import {
  CAMPAIGN_STATUS_LABEL,
  CONFIDENCE_LABEL,
  DIRECTION_LABEL,
  DIRECTION_SOURCE,
  SERVICE_STATUS_LABEL,
  WORK_STATUS_LABEL,
  figures,
  labelOf,
  moscowDayStart,
  openWorks,
  proposalKey,
  spendByWeek,
  testPhase,
  type AdsDoc,
} from '../../../../lib/cabinet/ads/registry';
import { now as clockNow } from '../../../../lib/cabinet/clock';
import { formatAmount } from '../../../../lib/cabinet/money';
import { homeFor } from '../../../../lib/cabinet/nav';
import { recommendationMarks } from '../../../../lib/cabinet/recommendations';
import { requireActor } from '../../../../lib/cabinet/session';
import { markRecommendationAction } from '../../actions';

export const dynamic = 'force-dynamic';

const HREF = '/cabinet/manage/ads';
const DAY = 86_400_000;

const TABS = [
  { key: 'summary', label: 'Сводка' },
  { key: 'proposals', label: 'Предложения' },
  { key: 'works', label: 'Работы и документы' },
  { key: 'services', label: 'Сервисы и MCP' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Рубли реестра — в общий формат денег кабинета (он принимает копейки). */
const rub = (value: number | null) => (value === null ? '—' : formatAmount(Math.round(value * 100)));
const share = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1).replace('.', ',')} %`);
const count = (value: number) => value.toLocaleString('ru-RU');
const day = (iso: string | null) => (iso === null ? '—' : iso.split('-').reverse().join('.'));

function DocLink({ slug, docs, label }: { slug: string | null; docs: readonly AdsDoc[]; label?: string }) {
  const doc = slug === null ? undefined : docs.find((item) => item.slug === slug);
  if (doc === undefined) return null;
  const style = { color: 'var(--pd-accent)', textDecoration: 'underline', textUnderlineOffset: 3 } as const;
  return doc.external === null ? (
    <a href={adsDocHref(doc.slug)} style={style}>
      {label ?? doc.title}
    </a>
  ) : (
    <a href={doc.external} target="_blank" rel="noopener noreferrer" style={style}>
      {label ?? `${doc.title} (в репозитории)`}
    </a>
  );
}

/**
 * «Реклама» руководителя (решение Р-550): стратегия и ход работ по
 * продвижению, предложения с отметками, состояние подключений по MCP,
 * бюджеты и показатели кампаний с ключевыми выводами. Реестр ведётся в
 * папке `marketing/` репозитория; заявки с посадочных считаются по базе
 * кабинета. Предложения отмечаются тем же механизмом, что рекомендации:
 * принять, отклонить, отложить, поручить.
 */
export default async function AdsScreen({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string }> }) {
  const actor = await requireActor(HREF);
  if (!can(actor, 'ANALYTICS_VIEW')) redirect(homeFor(actor));
  const flags = await searchParams;
  const tab: TabKey = TABS.some((item) => item.key === flags.tab) ? (flags.tab as TabKey) : 'summary';
  const registry = ADS_REGISTRY;
  const now = clockNow();

  const tabs = (
    <Tabs
      label="Разделы рекламы"
      items={TABS.map((item) => ({
        href: item.key === 'summary' ? HREF : `${HREF}?tab=${item.key}`,
        label: item.label,
        active: item.key === tab,
      }))}
    />
  );
  const head = (
    <ScreenHead
      title="Реклама"
      note={`Тест: ${day(registry.test.from)} — ${day(registry.test.to)}`}
    />
  );

  if (tab === 'proposals') {
    const marks = await recommendationMarks(actor);
    const waiting = registry.proposals.filter((row) => !marks.has(proposalKey(row.id))).length;
    return (
      <Shell actor={actor} current={HREF}>
        {head}
        {tabs}
        <ActionError id={flags.error} />
        <Card>
          <Heading level={2} size={3}>
            Предложения по продвижению
          </Heading>
          <Text muted size={13} style={{ margin: '6px 0 16px' }}>
            {`Ждут решения: ${waiting} из ${registry.proposals.length}.`}
          </Text>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
            {registry.proposals.map((row) => (
              <RecommendationCard
                key={row.id}
                kind={labelOf(DIRECTION_LABEL, row.direction)}
                title={row.title}
                details={
                  <>
                    {`${row.effect} `}
                    <DocLink slug={row.doc} docs={registry.docs} label="Подробнее" />
                  </>
                }
                marked={marks.has(proposalKey(row.id))}
              >
                <RecommendationMarks
                  markKey={proposalKey(row.id)}
                  mark={marks.get(proposalKey(row.id))}
                  back="ads"
                  action={markRecommendationAction}
                  assignHref={assignHref(row.title)}
                />
              </RecommendationCard>
            ))}
          </div>
        </Card>
      </Shell>
    );
  }

  if (tab === 'works') {
    const groups = [...new Set(registry.docs.map((doc) => doc.group))];
    const done = registry.works.filter((work) => work.status === 'DONE').length;
    return (
      <Shell actor={actor} current={HREF}>
        {head}
        {tabs}
        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3}>
            Работы
          </Heading>
          <Text muted size={13} style={{ margin: '6px 0 14px' }}>
            {`Сделано ${done} из ${registry.works.length}.`}
          </Text>
          <TableScroll label="Работы по продвижению">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={TABLE_HEAD}>Работа</th>
                  <th scope="col" style={TABLE_HEAD}>Кто</th>
                  <th scope="col" style={TABLE_HEAD}>Срок</th>
                  <th scope="col" style={TABLE_HEAD}>Состояние</th>
                  <th scope="col" style={TABLE_HEAD}>Документ</th>
                </tr>
              </thead>
              <tbody>
                {registry.works.map((work) => (
                  <tr key={work.id}>
                    <td style={TABLE_CELL}>{work.title}</td>
                    <td style={TABLE_CELL}>{work.owner}</td>
                    <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap' }}>{day(work.due)}</td>
                    <td style={TABLE_CELL}>
                      <Chip tone={work.status === 'DONE' ? 'accent' : 'neutral'}>{labelOf(WORK_STATUS_LABEL, work.status)}</Chip>
                    </td>
                    <td style={TABLE_CELL}>
                      <DocLink slug={work.doc} docs={registry.docs} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
        <Card>
          <Heading level={2} size={3}>
            Документы
          </Heading>
          <Text muted size={13} style={{ margin: '6px 0 14px' }}>
            Стратегия, исследования и настройки кампаний.
          </Text>
          <div style={{ display: 'grid', gap: 18 }}>
            {groups.map((group) => (
              <div key={group}>
                <Mono>{group}</Mono>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
                  {registry.docs
                    .filter((doc) => doc.group === group)
                    .map((doc) => (
                      <li key={doc.slug} style={{ fontSize: 15, lineHeight: 1.6 }}>
                        <DocLink slug={doc.slug} docs={registry.docs} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </Shell>
    );
  }

  if (tab === 'services') {
    return (
      <Shell actor={actor} current={HREF}>
        {head}
        {tabs}
        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3}>
            Сервисы и подключения по MCP
          </Heading>
          <Text muted size={13} style={{ margin: '6px 0 14px' }}>
            Агент читает отчёты; любое изменение в кампаниях — только после вашего подтверждения.
          </Text>
          <TableScroll label="Сервисы рекламы">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={TABLE_HEAD}>Сервис</th>
                  <th scope="col" style={TABLE_HEAD}>Назначение</th>
                  <th scope="col" style={TABLE_HEAD}>Состояние</th>
                  <th scope="col" style={TABLE_HEAD}>Следующий шаг</th>
                  <th scope="col" style={TABLE_HEAD}>Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {registry.services.map((service) => (
                  <tr key={service.id}>
                    <td style={{ ...TABLE_CELL, fontWeight: 500, color: 'var(--pd-ink)' }}>{service.name}</td>
                    <td style={TABLE_CELL}>{service.purpose}</td>
                    <td style={TABLE_CELL}>
                      <Chip tone={service.status === 'ACTIVE' || service.status === 'READ_ONLY' ? 'accent' : 'neutral'}>
                        {labelOf(SERVICE_STATUS_LABEL, service.status)}
                      </Chip>
                      {service.mode === null ? null : (
                        <Text muted size={13} style={{ marginTop: 4 }}>
                          {service.mode}
                        </Text>
                      )}
                    </td>
                    <td style={TABLE_CELL}>{service.next ?? '—'}</td>
                    <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap' }}>{day(service.updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>
        <ButtonLink href={adsDocHref('mcp-spec')}>Спецификация агента</ButtonLink>
      </Shell>
    );
  }

  // Сводка.
  const from = moscowDayStart(registry.test.from);
  const to = new Date(moscowDayStart(registry.test.to).getTime() + DAY);
  const baselineFrom = new Date(from.getTime() - registry.test.baselineDays * DAY);
  const sources = Object.values(DIRECTION_SOURCE);
  const rows = await funnelRows(actor, sources, baselineFrom, to);
  const funnels = sourceFunnels(rows, sources, { from, to, baselineFrom });
  const total = figures(registry.campaigns);
  const phase = testPhase(registry, now);
  const weeks = spendByWeek(registry.weeks);
  const steps = openWorks(registry.works).slice(0, 6);
  const leadsTotal = funnels.reduce((acc, row) => acc + row.test.total, 0);
  const leadsTargeted = funnels.reduce((acc, row) => acc + row.test.targeted, 0);
  const sourceLabel = (source: string) =>
    labelOf(DIRECTION_LABEL, Object.entries(DIRECTION_SOURCE).find(([, value]) => value === source)?.[0] ?? source);

  const daysLeft = Math.ceil((from.getTime() - now.getTime()) / DAY);
  const phaseText =
    phase.phase === 'before'
      ? `До запуска ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}.`
      : phase.phase === 'running'
        ? `Идёт день ${phase.day} из ${phase.days}.`
        : 'Тест завершён.';

  return (
    <Shell actor={actor} current={HREF}>
      {head}
      {tabs}
      <Notice tone="quiet">{phaseText}</Notice>

      <div style={{ margin: '20px 0' }}>
        <Tiles>
          <Tile label="Бюджет теста" value={rub(registry.test.budgetWithVat)} note="с НДС" />
          <Tile label="Израсходовано" value={rub(total.spend)} note={`${share(total.spent)} плана`} />
          <Tile label="Клики" value={count(total.clicks)} note={`CTR ${share(total.ctr)}`} />
          <Tile label="Цена клика" value={rub(total.cpc)} />
          <Tile label="Заявки" value={count(leadsTotal)} note={`целевых: ${leadsTargeted}`} />
        </Tiles>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <Heading level={2} size={3}>
          Кампании
        </Heading>
        <Text muted size={13} style={{ margin: '6px 0 14px' }}>
          Суммы без НДС.
        </Text>
        <TableScroll label="Кампании и бюджеты">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={TABLE_HEAD}>Кампания</th>
                <th scope="col" style={TABLE_HEAD}>Направление</th>
                <th scope="col" style={TABLE_HEAD}>Состояние</th>
                <th scope="col" style={TABLE_NUM_HEAD}>План</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Расход</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Освоено</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Показы</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Клики</th>
                <th scope="col" style={TABLE_NUM_HEAD}>CTR</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Цена клика</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Заявки</th>
              </tr>
            </thead>
            <tbody>
              {registry.campaigns.map((campaign) => {
                const own = figures([campaign]);
                return (
                  <tr key={campaign.id}>
                    <td style={TABLE_CELL}>
                      <span style={{ fontWeight: 500, color: 'var(--pd-ink)' }}>{campaign.platform}</span>
                    </td>
                    <td style={TABLE_CELL}>{labelOf(DIRECTION_LABEL, campaign.direction)}</td>
                    <td style={TABLE_CELL}>
                      <Chip tone={campaign.status === 'ACTIVE' ? 'accent' : 'neutral'}>
                        {labelOf(CAMPAIGN_STATUS_LABEL, campaign.status)}
                      </Chip>
                    </td>
                    <td style={TABLE_NUM}>{rub(campaign.budgetPlan)}</td>
                    <td style={TABLE_NUM}>{rub(campaign.spend)}</td>
                    <td style={TABLE_NUM}>{share(own.spent)}</td>
                    <td style={TABLE_NUM}>{count(campaign.impressions)}</td>
                    <td style={TABLE_NUM}>{count(campaign.clicks)}</td>
                    <td style={TABLE_NUM}>{share(own.ctr)}</td>
                    <td style={TABLE_NUM}>{rub(own.cpc)}</td>
                    <td style={TABLE_NUM}>{count(campaign.leads)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ ...TABLE_CELL, fontWeight: 600, color: 'var(--pd-ink)' }} colSpan={3}>
                  Итого
                </td>
                <td style={TABLE_NUM}>{rub(total.budgetPlan)}</td>
                <td style={TABLE_NUM}>{rub(total.spend)}</td>
                <td style={TABLE_NUM}>{share(total.spent)}</td>
                <td style={TABLE_NUM}>{count(total.impressions)}</td>
                <td style={TABLE_NUM}>{count(total.clicks)}</td>
                <td style={TABLE_NUM}>{share(total.ctr)}</td>
                <td style={TABLE_NUM}>{rub(total.cpc)}</td>
                <td style={TABLE_NUM}>{count(total.leads)}</td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <Heading level={2} size={3}>
          Заявки с посадочных
        </Heading>
        <Text muted size={13} style={{ margin: '6px 0 14px' }}>
          Заявки со страниц сайта за время теста. Целевая — после консультации.
        </Text>
        <TableScroll label="Заявки с посадочных за период теста">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th scope="col" style={TABLE_HEAD}>Направление</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Заявки</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Целевые</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Договоры</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Отказы</th>
                <th scope="col" style={TABLE_NUM_HEAD}>В разборе</th>
                <th scope="col" style={TABLE_NUM_HEAD}>Спам</th>
                <th scope="col" style={TABLE_NUM_HEAD}>До теста, в неделю</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((row) => (
                <tr key={row.source}>
                  <td style={TABLE_CELL}>{sourceLabel(row.source)}</td>
                  <td style={TABLE_NUM}>{count(row.test.total)}</td>
                  <td style={TABLE_NUM}>{count(row.test.targeted)}</td>
                  <td style={TABLE_NUM}>{count(row.test.contracted)}</td>
                  <td style={TABLE_NUM}>{count(row.test.declined)}</td>
                  <td style={TABLE_NUM}>{count(row.test.open)}</td>
                  <td style={TABLE_NUM}>{count(row.test.spam)}</td>
                  <td style={TABLE_NUM}>{row.baselineWeekly === null ? '—' : row.baselineWeekly.toFixed(1).replace('.', ',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <Heading level={2} size={3}>
          Расход по неделям
        </Heading>
        {weeks.length === 0 ? (
          <Text muted style={{ marginTop: 8 }}>
            Появится после первой недели теста.
          </Text>
        ) : (
          <div style={{ marginTop: 12 }}>
            <BarChart
              title="Расход по неделям, рубли без НДС"
              data={weeks.map((week) => ({ label: day(week.week).slice(0, 5), value: Math.round(week.spend) }))}
              unit="₽"
            />
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <Heading level={2} size={3}>
          Ключевые выводы
        </Heading>
        {/* Каждый вывод — своя плашка, как карточки рекомендаций: подряд
            идущие выводы без рамок сливались (замечание владельца 12.10.2026). */}
        <div style={{ display: 'grid', gap: 12, marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))' }}>
          {registry.conclusions.map((row, index) => (
            <article
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '14px 16px 16px',
                border: '1px solid var(--pd-border)',
                borderRadius: RADIUS.field,
                background: 'var(--pd-surface-quiet)',
              }}
            >
              <Mono>{`${labelOf(CONFIDENCE_LABEL, row.confidence)} · ${day(row.date)}`}</Mono>
              <Text size={15} style={{ lineHeight: 1.5 }}>
                {row.text}
              </Text>
              <Text muted size={13} style={{ marginTop: 'auto' }}>
                <DocLink slug={row.doc} docs={registry.docs} label="Подробнее" />
              </Text>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <Heading level={2} size={3}>
          Ближайшие шаги
        </Heading>
        {steps.length === 0 ? (
          <Text muted style={{ marginTop: 8 }}>
            Все работы реестра сделаны.
          </Text>
        ) : (
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
            {steps.map((work) => (
              <li key={work.id} style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--pd-ink-secondary)' }}>
                {`${day(work.due).slice(0, 5)} · ${work.title} · ${work.owner}`}
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 14 }}>
          <ButtonLink href={`${HREF}?tab=works`}>Все работы и документы</ButtonLink>
        </div>
      </Card>
    </Shell>
  );
}
