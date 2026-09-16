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
  formatDate,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { leadQueue, serviceTypes } from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';
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

  const [leads, types] = await Promise.all([leadQueue(actor), serviceTypes()]);

  return (
    <Shell actor={actor} current="/cabinet/manage">
      <Mono>Очередь заявок</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
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
                <form action={moderateLead} style={{ display: 'grid', gap: 16 }}>
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

                <form action={moderateLead} style={{ display: 'grid', gap: 16 }}>
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
