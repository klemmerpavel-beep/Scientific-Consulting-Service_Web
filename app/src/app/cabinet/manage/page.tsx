import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Heading,
  Mono,
  Text,
  Tile,
  Tiles,
  formatDate,
  plural,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { formatAmount } from '../../../lib/cabinet/money';
import { leadQueue, serviceTypes, trafficLight } from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';
import { OVERHEAD_PERCENT, practiceSummary } from '../../../lib/cabinet/summary';
import { moderateLead } from '../actions';

export const dynamic = 'force-dynamic';

const SOURCE_LABEL: Record<string, string> = {
  landing: 'Посадочная',
  postgrad: 'Аспирантам',
  students: 'Студентам',
  business: 'Бизнесу',
  cabinet: 'Из кабинета',
};

export default async function ManageQueue() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_MODERATE')) redirect('/cabinet/projects');

  const [leads, types, light] = await Promise.all([
    leadQueue(actor),
    serviceTypes(),
    trafficLight(actor),
  ]);

  // Сводка — это деньги практики, и её видит только тот, кому открыта маржа.
  const summary = can(actor, 'MARGIN_VIEW') ? await practiceSummary(actor) : null;

  const lanes = [
    {
      key: 'overdue',
      title: 'Просрочены',
      tone: 'warn' as const,
      rows: light.overdue,
      hint: 'Срок этапа прошёл, а этап не закрыт.',
    },
    {
      key: 'soon',
      title: 'Срок в пределах недели',
      tone: 'accent' as const,
      rows: light.soon,
      hint: 'Ещё не сорвано, но резерва уже нет.',
    },
    {
      key: 'stalled',
      title: 'Ждут клиента дольше двух недель',
      tone: 'neutral' as const,
      rows: light.stalled,
      hint: 'Просрочки может не быть, а работа стоит.',
    },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage">
      {summary === null ? null : (
        <section style={{ marginBottom: 36 }}>
          <Mono>Практика на сегодня</Mono>
          <Heading level={1} style={{ margin: '12px 0 16px' }}>
            Сводка
          </Heading>
          <Tiles>
            <Tile
              label="Заказов"
              value={String(summary.orders)}
              note={`${summary.active} ${plural(summary.active, 'в работе', 'в работе', 'в работе')}, остальные закрыты или остановлены`}
            />
            <Tile
              label="Выручка"
              value={formatAmount(summary.received)}
              note={`получено по оплаченным траншам; законтрактовано ${formatAmount(summary.contracted)}`}
            />
            <Tile
              label="Прибыль"
              value={formatAmount(summary.profit)}
              note={
                summary.payouts === 0n
                  ? `поступления за вычетом ${OVERHEAD_PERCENT} % накладных расходов; вознаграждение сторонним исполнителям не заведено`
                  : `поступления за вычетом начислений исполнителям (${formatAmount(summary.payouts)}) и ${OVERHEAD_PERCENT} % накладных расходов`
              }
            />
            <Tile
              label="К получению"
              value={formatAmount(summary.outstanding)}
              note="выставлено и запланировано, но не оплачено"
            />
          </Tiles>
        </section>
      )}

      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <Mono>Сроки</Mono>
          <a href="/cabinet/manage/registry" style={{ marginLeft: 'auto', fontSize: 14 }}>
            Реестры клиентов и экспертов
          </a>
        </div>

        <div
          className="cab-two"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
            gap: 16,
            marginTop: 12,
          }}
        >
          {lanes.map((lane) => (
            <Card key={lane.key}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <Chip tone={lane.rows.length === 0 ? 'ok' : lane.tone}>{lane.rows.length}</Chip>
                <Heading level={3}>{lane.title}</Heading>
              </div>
              {lane.rows.length === 0 ? (
                <Text muted size={13}>
                  {lane.hint}
                </Text>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                  {lane.rows.slice(0, 5).map((stage) => (
                    <li key={stage.id}>
                      <Text size={14}>
                        <a href={`/cabinet/stages/${stage.id}`}>{stage.title}</a>
                      </Text>
                      <Text muted size={13}>
                        {stage.project.code} · {stage.project.client.fullName}
                        {stage.dueOn === null ? '' : ` · срок ${formatDate(stage.dueOn)}`}
                      </Text>
                    </li>
                  ))}
                  {lane.rows.length > 5 ? (
                    <li>
                      <Text muted size={13}>
                        и ещё {lane.rows.length - 5}
                      </Text>
                    </li>
                  ) : null}
                </ul>
              )}
            </Card>
          ))}
        </div>
      </section>

      <Mono>Очередь заявок</Mono>
      <Heading level={2} style={{ margin: '12px 0 8px', fontSize: 26 }}>
        Заявки на рассмотрении
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        Одобренная заявка разворачивается в проект и получает код. Отклонённая остаётся в системе
        с причиной, которую видит заявитель. Заявки не удаляются.
      </Text>

      {leads.length === 0 ? (
        <Empty title="Очередь пуста">Новые обращения с сайта появятся здесь.</Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 20 }}>
          {leads.map((lead) => (
            <Card as="li" key={lead.id}>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <Chip tone="accent">{SOURCE_LABEL[lead.source] ?? lead.source}</Chip>
                <Chip mono>{formatDate(lead.createdAt)}</Chip>
                {lead.consentGiven ? <Chip tone="ok">согласие получено</Chip> : null}
              </div>

              <Heading level={2} style={{ marginBottom: 8 }}>
                {lead.name ?? 'Без имени'}
              </Heading>
              <Text size={14} style={{ marginBottom: 4 }}>
                {lead.contactKind === 'email' ? 'Почта' : 'Телефон'}: {lead.contact}
              </Text>
              {lead.topic === null ? null : (
                <Text size={14} style={{ marginBottom: 4 }}>
                  Тема: {lead.topic}
                </Text>
              )}
              {lead.message === null ? null : (
                <Text muted size={14} style={{ marginBottom: 4 }}>
                  {lead.message}
                </Text>
              )}

              <div
                className="cab-two"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)',
                  gap: 24,
                  marginTop: 20,
                  paddingTop: 20,
                  borderTop: '1px solid var(--pd-divider)',
                  alignItems: 'start',
                }}
              >
                {/* minmax(0,1fr): колонка по содержимому растягивалась под самый
                    длинный вариант в списке типов, и на экране уже 420 px форма
                    вылезала за край страницы (решение Р-130). */}
                <form
                  action={moderateLead}
                  style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }}
                >
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <Field
                    label="Название проекта"
                    name="title"
                    required
                    defaultValue={lead.topic ?? ''}
                    placeholder="Сопровождение кандидатской диссертации"
                  />
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Тип сопровождения</span>
                    <select
                      name="serviceTypeId"
                      required
                      style={{
                        minHeight: 44,
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '1px solid var(--pd-edge-neutral)',
                        background: 'var(--pd-ink-inverse)',
                        // Список выбора сам по себе не сжимается ниже своего
                        // самого длинного варианта: ширину задаём явно.
                        width: '100%',
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      {types.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" name="applyTemplate" style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 14 }}>Применить шаблон этапов этого типа</span>
                  </label>
                  <div>
                    <Button>Одобрить и создать проект</Button>
                  </div>
                </form>

                <form
                  action={moderateLead}
                  style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }}
                >
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <Field
                    label="Причина отказа"
                    name="reason"
                    required
                    multiline
                    hint="Причину видит заявитель, поэтому она пишется человеческим языком."
                  />
                  <div>
                    <Button tone="quiet">Отклонить</Button>
                  </div>
                </form>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </Shell>
  );
}
