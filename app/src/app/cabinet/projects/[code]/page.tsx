import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Mono,
  Roadmap,
  StatusLine,
  Text,
  Thread,
  authorName,
  formatDate,
  plural,
  type RoadmapItem,
  type StageStateKey,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { listMessages, unreadCount } from '../../../../lib/cabinet/messages';
import { experts, projectByCode } from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';
import { createStage, postMessage, setExpert } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * Подписи событий ленты.
 *
 * Событие о назначении исполнителя клиенту не показывается: для него
 * работу ведёт куратор, а состав привлечённых специалистов — внутреннее
 * дело практики.
 */
const EVENT_LABEL: Record<string, string> = {
  PROJECT_CREATED: 'Работа принята в сопровождение',
  EXPERT_ASSIGNED: 'Назначен исполнитель',
  STAGE_STATE_CHANGED: 'Этап сменил состояние',
  VERSION_UPLOADED: 'Приложена новая версия материала',
};

const CLIENT_HIDDEN_EVENTS = new Set(['EXPERT_ASSIGNED']);

/** Что требуется от клиента в этом состоянии этапа. */
const ACTION_BY_STATE: Partial<Record<StageStateKey, string>> = {
  AWAITING_CLIENT: 'От вас нужны материалы или данные — откройте этап и приложите их.',
  IN_APPROVAL: 'Этап готов и ждёт вашего согласования: посмотрите материалы и подтвердите.',
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
  const forClient = actor.role === 'CLIENT';
  const mayEdit = can(actor, 'STAGE_EDIT', ref);
  const mayAssign = can(actor, 'PROJECT_ASSIGN_EXPERT', ref);
  const maySeeContacts = can(actor, 'CONTACTS_VIEW', ref);
  const mayWrite = can(actor, 'MESSAGE_READ', ref);
  const unread = mayWrite ? await unreadCount(actor, project.id) : 0;
  // Короткий разговор виден прямо на карточке работы: уходить за ним на
  // отдельный экран, чтобы прочитать три строки, незачем. Прочитанным он
  // здесь не помечается — отметку ставит открытие самой переписки.
  const thread = mayWrite ? (await listMessages(actor, project.id)).slice(-3) : [];
  const expertList = mayAssign ? await experts() : [];

  const stages = project.stages;
  const done = stages.filter((stage) => stage.state === 'DONE').length;
  // Текущий этап — первый незавершённый; он и отвечает на вопрос «где работа».
  const current = stages.find((stage) => stage.state !== 'DONE') ?? null;
  const action = current === null ? null : (ACTION_BY_STATE[current.state as StageStateKey] ?? null);

  const roadmap: RoadmapItem[] = stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    state: stage.state as StageStateKey,
    dueOn: formatDate(stage.dueOn),
    href: `/cabinet/stages/${stage.id}`,
    note: stage.state === 'AWAITING_CLIENT' ? stage.blockedReason : null,
  }));

  const events = project.events.filter(
    (event) => !forClient || !CLIENT_HIDDEN_EVENTS.has(event.kind),
  );

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip mono>{project.code}</Chip>
        {/* Тип работы часто и есть её название — у всего, что перенесено из
            книги заказов. Печатать его дважды подряд незачем. */}
        {project.title === project.serviceType.name ? null : (
          <Chip tone="accent">{project.serviceType.name}</Chip>
        )}
        {project.dueOn === null ? null : <Chip>срок — {formatDate(project.dueOn)}</Chip>}
      </div>

      <Heading level={1} style={{ margin: '16px 0 8px' }}>
        {project.title}
      </Heading>
      {project.topic === null ? null : <Text style={{ marginBottom: 20 }}>{project.topic}</Text>}

      {/* Ответ на главный вопрос клиента стоит первым и целиком: где работа
          сейчас и что требуется от него. Собирать его из полосы этапов и
          ленты событий человек не обязан. */}
      <div style={{ marginTop: 20 }}>
        <StatusLine
          state={current === null ? null : (current.state as StageStateKey)}
          title={current === null ? null : current.title}
          dueOn={current === null ? null : formatDate(current.dueOn)}
          action={action}
        />
      </div>

      <section style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
          <Heading level={2}>Ход работы</Heading>
          {stages.length === 0 ? null : (
            <Text muted size={14}>
              {done} из {stages.length} {plural(stages.length, 'этапа', 'этапов', 'этапов')}
            </Text>
          )}
        </div>
        <Card>
          <Roadmap items={roadmap} />

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

      {mayWrite ? (
        <section style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
            <Heading level={2}>{forClient ? 'Переписка с куратором' : 'Переписка с клиентом'}</Heading>
            <a className="cab-mark" href={`/cabinet/projects/${project.code}/messages`}>
              Вся переписка{unread > 0 ? ` · ${unread} новых` : ''}
            </a>
          </div>
          <Card>
            <Thread
              messages={thread}
              viewer={actor}
              flagContacts={can(actor, 'COMMENT_MODERATE', ref)}
              empty={forClient ? 'Переписки пока нет — напишите куратору.' : 'Переписки пока нет.'}
            />
            <form
              action={postMessage}
              style={{
                display: 'grid',
                gap: 12,
                marginTop: 20,
                paddingTop: 20,
                borderTop: '1px solid var(--pd-divider)',
              }}
            >
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="code" value={project.code} />
              {/* Отправив отсюда, человек остаётся на карточке работы. */}
              <input type="hidden" name="back" value="project" />
              <Field label="Сообщение" name="body" multiline required />
              <div>
                <Button>Отправить</Button>
              </div>
            </form>
          </Card>
        </section>
      ) : null}

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
          <Heading level={2} style={{ marginBottom: 12 }}>События</Heading>
          <Card>
            {events.length === 0 ? (
              <Text muted>Событий пока нет.</Text>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
                {events.map((event) => (
                  <li
                    key={event.id}
                    style={{ borderBottom: '1px solid var(--pd-divider)', paddingBottom: 14 }}
                  >
                    <Text size={14}>{EVENT_LABEL[event.kind] ?? event.kind}</Text>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {formatDate(event.createdAt)}
                      {event.actor === null
                        ? ''
                        : ` · ${authorName(event.actor, actor, event.actorId ?? undefined)}`}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <Heading level={2} style={{ marginBottom: 12 }}>Куратор</Heading>
          <Card>
            <Text size={14} style={{ marginBottom: 4 }}>
              <strong>{project.manager.fullName}</strong>
            </Text>
            <Text muted size={13} style={{ marginBottom: 12 }}>
              куратор работы
            </Text>

            <div style={{ display: 'grid', gap: 4 }}>
              <a className="cab-mark" href={`/cabinet/projects/${project.code}/materials`}>
                Материалы работы
              </a>
              {can(actor, 'CONTRACT_VIEW', ref) && !forClient ? (
                <a className="cab-mark" href={`/cabinet/projects/${project.code}/payments`}>
                  Оплаты и документы
                </a>
              ) : null}
            </div>

            {forClient ? null : (
              <div
                style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--pd-divider)' }}
              >
                <Mono>Исполнитель</Mono>
                {project.expert === null ? (
                  <Text muted size={14} style={{ marginTop: 8 }}>
                    Исполнитель ещё не назначен.
                  </Text>
                ) : (
                  <>
                    <Text size={14} style={{ margin: '8px 0 4px' }}>
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
              </div>
            )}

            {mayAssign ? (
              <form
                action={setExpert}
                style={{
                  display: 'grid',
                  gap: 12,
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid var(--pd-divider)',
                }}
              >
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="code" value={project.code} />
                <label htmlFor="expertId" style={{ fontSize: 14, fontWeight: 500 }}>
                  Назначить исполнителя
                </label>
                <select
                  id="expertId"
                  name="expertId"
                  defaultValue={project.expertId ?? ''}
                  style={{
                    boxSizing: 'border-box',
                    minHeight: 48,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--pd-edge-neutral)',
                    background: 'var(--pd-ink-inverse)',
                    color: 'var(--pd-ink)',
                    fontSize: 16,
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
                <Text muted size={13}>
                  Без договора поручения обработки персональных данных исполнитель не получит
                  доступа к материалам клиента, даже будучи назначенным.
                </Text>
                <Button tone="quiet">Сохранить</Button>
              </form>
            ) : null}

            {maySeeContacts ? (
              <div
                style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--pd-divider)' }}
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
