import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Mono,
  Stepper,
  Text,
  formatDate,
  type StageStateKey,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { projectByCode } from '../../../../lib/cabinet/queries';
import { experts } from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';
import { createStage, setExpert } from '../../actions';

export const dynamic = 'force-dynamic';

const EVENT_LABEL: Record<string, string> = {
  PROJECT_CREATED: 'Проект создан',
  EXPERT_ASSIGNED: 'Назначен эксперт',
  STAGE_STATE_CHANGED: 'Изменилось состояние этапа',
  VERSION_UPLOADED: 'Загружена новая версия материала',
};

export default async function ProjectScreen({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const { code } = await params;
  const project = await projectByCode(actor, decodeURIComponent(code));
  // Чужой проект не отличается от несуществующего: иначе перебор кодов
  // показывал бы, какие проекты есть у практики.
  if (project === null) notFound();

  const ref = {
    id: project.id,
    clientId: project.clientId,
    managerId: project.managerId,
    expertId: project.expertId,
  };
  const mayEdit = can(actor, 'STAGE_EDIT', ref);
  const mayAssign = can(actor, 'PROJECT_ASSIGN_EXPERT', ref);
  const maySeeContacts = can(actor, 'CONTACTS_VIEW', ref);
  const expertList = mayAssign ? await experts() : [];

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip mono>{project.code}</Chip>
        <Chip tone="accent">{project.serviceType.name}</Chip>
        {project.dueOn === null ? null : <Chip>срок — {formatDate(project.dueOn)}</Chip>}
      </div>

      <Heading level={1} style={{ margin: '16px 0 8px' }}>
        {project.title}
      </Heading>
      {project.topic === null ? null : (
        <Text style={{ marginBottom: 24 }}>{project.topic}</Text>
      )}

      <section style={{ marginTop: 24 }}>
        <Mono>Этапы</Mono>
        <Card style={{ marginTop: 12 }}>
          <Stepper
            items={project.stages.map((stage) => ({
              id: stage.id,
              title: stage.title,
              state: stage.state as StageStateKey,
              dueOn: formatDate(stage.dueOn),
              href: `/cabinet/stages/${stage.id}`,
            }))}
          />

          {mayEdit ? (
            <form
              action={createStage}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
                marginTop: 24,
                paddingTop: 20,
                borderTop: '1px solid var(--pd-divider)',
              }}
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="code" value={project.code} />
              <div style={{ flex: '1 1 320px' }}>
                <Field
                  label="Новый этап"
                  name="title"
                  required
                  placeholder="Глава 2. Модель отказов лимитирующих узлов"
                  hint="Название свободное; состояние выбирается на экране этапа из пяти."
                />
              </div>
              <Button tone="quiet">Добавить этап</Button>
            </form>
          ) : null}
        </Card>
      </section>

      <div
        className="cab-two"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)',
          gap: 24,
          marginTop: 32,
          alignItems: 'start',
        }}
      >
        <section>
          <Mono>Лента событий</Mono>
          <Card style={{ marginTop: 12 }}>
            {project.events.length === 0 ? (
              <Text muted>Событий пока нет.</Text>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
                {project.events.map((event) => (
                  <li
                    key={event.id}
                    style={{ borderBottom: '1px solid var(--pd-divider)', paddingBottom: 14 }}
                  >
                    <Text size={14}>{EVENT_LABEL[event.kind] ?? event.kind}</Text>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {formatDate(event.createdAt)}
                      {event.actor === null ? '' : ` · ${event.actor.fullName}`}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <Mono>Кто ведёт проект</Mono>
          <Card style={{ marginTop: 12 }}>
            <Text size={14} style={{ marginBottom: 4 }}>
              <strong>{project.manager.fullName}</strong>
            </Text>
            <Text muted size={13} style={{ marginBottom: 16 }}>
              менеджер проекта
            </Text>

            {project.expert === null ? (
              <Text muted size={14}>
                Эксперт ещё не назначен.
              </Text>
            ) : (
              <>
                <Text size={14} style={{ marginBottom: 4 }}>
                  <strong>{project.expert.fullName}</strong>
                </Text>
                <Text muted size={13}>
                  {project.expert.expertProfile?.degree ?? 'эксперт'}
                  {project.expert.expertProfile?.specialization
                    ? ` · ${project.expert.expertProfile.specialization}`
                    : ''}
                </Text>
              </>
            )}

            {mayAssign ? (
              <form
                action={setExpert}
                style={{
                  display: 'grid',
                  gap: 12,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--pd-divider)',
                }}
              >
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="code" value={project.code} />
                <label style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Назначить эксперта</span>
                  <select
                    name="expertId"
                    defaultValue={project.expertId ?? ''}
                    style={{
                      minHeight: 44,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--pd-edge-neutral)',
                      background: 'var(--pd-ink-inverse)',
                    }}
                  >
                    <option value="">— не назначен —</option>
                    {expertList.map((expert) => (
                      <option key={expert.id} value={expert.id}>
                        {expert.fullName}
                        {expert.expertProfile?.ndaSignedAt === null ||
                        expert.expertProfile?.ndaSignedAt === undefined
                          ? ' — без договора поручения'
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <Text muted size={13}>
                  Без договора поручения обработки персональных данных эксперт не получит доступа
                  к материалам клиента, даже будучи назначенным.
                </Text>
                <Button tone="quiet">Сохранить</Button>
              </form>
            ) : null}

            {maySeeContacts ? (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--pd-divider)',
                }}
              >
                <Mono>Клиент</Mono>
                <Text size={14} style={{ marginTop: 8 }}>
                  {project.client.fullName}
                </Text>
                {project.client.email === null ? null : (
                  <Text muted size={13}>
                    {project.client.email}
                  </Text>
                )}
                {project.client.phone === null ? null : (
                  <Text muted size={13}>
                    {project.client.phone}
                  </Text>
                )}
              </div>
            ) : null}
          </Card>
        </section>
      </div>
    </Shell>
  );
}
