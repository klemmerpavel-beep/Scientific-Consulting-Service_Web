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
/** Исполнитель шага в реестре `marketing/`, который читает этот экран. */
const OWNER = 'Владелец';

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
/** Метка с прописной: «вероятно» в реестре — «Вероятно» на метке. */
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
                      <Chip nowrap tone={work.status === 'DONE' ? 'accent' : 'neutral'}>{labelOf(WORK_STATUS_LABEL, work.status)}</Chip>
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
                      <Chip nowrap tone={service.status === 'ACTIVE' || service.status === 'READ_ONLY' ? 'accent' : 'neutral'}>
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
  // Ближайшие шаги — раздельно: ваши (владельца) целиком, шаги команды —
  // первые четыре (замечание владельца 12.10.2026, Р-578).
  const open = openWorks(registry.works);
  const mine = open.filter((work) => work.owner === OWNER);
  const team = open.filter((work) => work.owner !== OWNER);
  const teamShown = team.slice(0, 4);
  // Сегодня по Москве (UTC+3 круглый год) — той же записью, что срок в реестре.
  const todayIso = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
  const late = (work: { due: string | null }) => work.due !== null && work.due < todayIso;
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
                      <Chip nowrap tone={campaign.status === 'ACTIVE' ? 'accent' : 'neutral'}>
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
            идущие выводы без рамок сливались (замечание владельца 12.10.2026).
            Плашки — по две в ряд, одной высоты в ряду (Р-189); в каждой одинаково
            стоят три строки: уверенность меткой и дата, вывод, «Подробнее» у
            нижнего края. Прежде плашек было по три, уверенность и дата шли
            одной моноширинной строкой прописными, и подписи плашек читались
            вразнобой (замечание владельца 12.10.2026, решение Р-579). */}
        <div style={{ display: 'grid', gap: 16, marginTop: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))' }}>
          {registry.conclusions.map((row, index) => (
            <article
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '16px 18px 18px',
                border: '1px solid var(--pd-border)',
                borderRadius: RADIUS.field,
                background: 'var(--pd-surface-quiet)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <Chip nowrap tone={row.confidence === 'sure' ? 'accent' : 'neutral'}>
                  {capital(labelOf(CONFIDENCE_LABEL, row.confidence))}
                </Chip>
                <Text muted size={13}>
                  {day(row.date)}
                </Text>
              </div>
              <Text size={15} style={{ lineHeight: 1.6, color: 'var(--pd-ink)' }}>
                {row.text}
              </Text>
              <Text muted size={13} style={{ marginTop: 'auto' }}>
                <DocLink slug={row.doc} docs={registry.docs} label="Подробнее" />
              </Text>
            </article>
          ))}
        </div>
      </Card>

      {/* «Ближайшие шаги» — таблицами: что сделать, к какому сроку и где
          инструкция. Ваши шаги — отдельно и целиком, шаги команды — ниже
          (замечание владельца 12.10.2026, решение Р-578). Прежде шаги
          стояли строкой «14.10 · Счётчик Метрики… · Владелец», без
          инструкции и без состояния. */}
      <Card>
        <Heading level={2} size={3}>
          Ближайшие шаги
        </Heading>
        {open.length === 0 ? (
          <Text muted style={{ marginTop: 8 }}>
            Все работы реестра сделаны.
          </Text>
        ) : (
          <>
            <Text muted size={13} style={{ margin: '6px 0 14px' }}>
              Что сделать до запуска, к какому сроку и где инструкция. Сделанный шаг уходит из списка.
            </Text>
            {[
              { key: 'mine', title: `Ваши шаги · ${mine.length}`, rows: mine, who: false },
              { key: 'team', title: `Шаги команды · ${team.length}`, rows: teamShown, who: true },
            ]
              .filter((group) => group.rows.length > 0)
              .map((group) => (
                <div key={group.key} style={{ marginBottom: 18 }}>
                  <Heading level={3} size={3} style={{ marginBottom: 8 }}>
                    {group.title}
                  </Heading>
                  <TableScroll label={group.key === 'mine' ? 'Ваши шаги' : 'Шаги команды'}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th scope="col" style={{ ...TABLE_HEAD, width: 120 }}>Срок</th>
                          <th scope="col" style={TABLE_HEAD}>Что сделать</th>
                          {group.who ? <th scope="col" style={TABLE_HEAD}>Кто</th> : null}
                          <th scope="col" style={TABLE_HEAD}>Инструкция</th>
                          <th scope="col" style={TABLE_HEAD}>Состояние</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((work) => (
                          <tr key={work.id}>
                            <td style={{ ...TABLE_CELL, whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--pd-ink)' }}>
                              {day(work.due)}
                              {late(work) ? (
                                <span style={{ display: 'block', fontWeight: 400, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                                  срок прошёл
                                </span>
                              ) : null}
                            </td>
                            <td style={{ ...TABLE_CELL, color: 'var(--pd-ink)' }}>{work.title}</td>
                            {group.who ? <td style={TABLE_CELL}>{work.owner}</td> : null}
                            <td style={TABLE_CELL}>
                              {/* Ссылка — строкой текста, как в абзаце: цель нажатия — сама
                                  строка (исключение для ссылок в тексте, WCAG 2.5.8). */}
                              <Text size={15}>
                                {work.doc === null ? '—' : <DocLink slug={work.doc} docs={registry.docs} />}
                              </Text>
                            </td>
                            <td style={TABLE_CELL}>
                              <Chip nowrap tone={work.status === 'IN_PROGRESS' ? 'accent' : 'neutral'}>
                                {labelOf(WORK_STATUS_LABEL, work.status)}
                              </Chip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                  {group.key === 'team' && team.length > teamShown.length ? (
                    <Text muted size={13} style={{ marginTop: 8 }}>
                      {`И ещё ${team.length - teamShown.length} — во вкладке «Работы и документы».`}
                    </Text>
                  ) : null}
                </div>
              ))}
          </>
        )}
        <div style={{ marginTop: 4 }}>
          <ButtonLink href={`${HREF}?tab=works`}>Все работы и документы</ButtonLink>
        </div>
      </Card>
    </Shell>
  );
}
