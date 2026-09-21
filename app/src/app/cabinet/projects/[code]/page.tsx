import { notFound, redirect } from 'next/navigation';

import { MONO, SANS } from '../../../../components/cabinet/tokens';
import Shell from '../../../../components/cabinet/Shell';
import {
  Board,
  BoardColumn,
  Button,
  ButtonLink,
  Chip,
  Disclosure,
  Field,
  Form,
  FormActions,
  Heading,
  MaterialList,
  Mono,
  ProgressPanel,
  ScreenTop,
  Roadmap,
  Select,
  Text,
  Thread,
  authorName,
  formatDate,
  formatSize,
  type MaterialRow,
  type RoadmapItem,
  type StageStateKey,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { listMessages, unreadCount } from '../../../../lib/cabinet/messages';
import {
  curators,
  experts,
  projectByCode,
  projectMaterials,
} from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';
import { createStage, postMessage, setExpert, setManager } from '../../actions';

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
  MANAGER_ASSIGNED: 'Работу принял другой куратор',
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

/**
 * Материалов в колонке видно столько, сколько помещается; остальные —
 * прокруткой. Дюжины хватает: длиннее человек уходит на свой экран, где
 * есть отбор по этапам и полная история версий.
 */
const MATERIALS_IN_COLUMN = 12;

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
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref);
  const unread = mayWrite ? await unreadCount(actor, project.id) : 0;
  // Короткий разговор виден прямо на экране заказа: уходить за ним на
  // отдельный экран, чтобы прочитать три строки, незачем. Прочитанным он
  // здесь не помечается — отметку ставит открытие самой переписки.
  const thread = mayWrite ? (await listMessages(actor, project.id)).slice(-8) : [];
  const expertList = mayAssign ? await experts(actor) : [];
  // Передать работу другому куратору может только руководитель (Р-149).
  const maySetManager = can(actor, 'PROJECT_SET_MANAGER', ref);
  const curatorList = maySetManager ? await curators(actor) : [];
  // Материалы берутся своей выборкой: она уже сужает и сами материалы, и
  // замечания по матрице прав, а `projectByCode` служит ещё четырём
  // экранам, и тянуть версии ради них было бы напрасной работой.
  const withMaterials = await projectMaterials(actor, decodeURIComponent(code));

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

  const materials: MaterialRow[] = (withMaterials?.materials ?? [])
    .slice(0, MATERIALS_IN_COLUMN)
    .map((material) => {
      const latest = material.versions[0] ?? null;
      return {
        id: material.id,
        title: material.title,
        stageTitle: material.stage === null ? null : `этап ${material.stage.position}`,
        versionNumber: latest?.number ?? null,
        size: latest === null ? null : formatSize(latest.sizeBytes),
        uploadedAt: latest === null ? null : formatDate(latest.uploadedAt),
        comments: latest?.comments.length ?? 0,
        href: latest === null ? null : `/cabinet/files/${latest.id}`,
      };
    });

  const events = project.events.filter(
    (event) => !forClient || !CLIENT_HIDDEN_EVENTS.has(event.kind),
  );

  // Тип работы часто и есть её название — у всего, что перенесено из книги
  // заказов; тема тоже нередко повторяет название другими словами. Ни то,
  // ни другое не печатается дважды.
  const facts = [
    project.title === project.serviceType.name ? null : project.serviceType.name,
    project.topic === project.title ? null : project.topic,
    `куратор — ${project.manager.fullName}`,
  ].filter((fact) => fact !== null);

  return (
    <Shell actor={actor} current="/cabinet/projects" board>
      {/* Шапка заказа — одной полосой. Прежде код, название и тема занимали
          три яруса и 154 пикселя: на панели это четверть места, отведённого
          колонкам (решение Р-169). */}
      <ScreenTop style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Код работы с экранов убран (решение Р-189): человеку он
            ничего не сообщает, а взгляд цепляет первым. */}
        <Heading level={1} size={2}>
          {project.title}
        </Heading>
        {project.dueOn === null ? null : (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: MONO,
              fontSize: 13,
              lineHeight: 1.4,
              color: 'var(--pd-ink-muted)',
            }}
          >
            срок — {formatDate(project.dueOn)}
          </span>
        )}
      </ScreenTop>
      {facts.length === 0 ? null : (
        <p
          style={{
            margin: '8px 0 0',
            fontFamily: SANS,
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--pd-ink-muted)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {facts.join(' · ')}
        </p>
      )}

      <ProgressPanel
          style={{ marginTop: 16, marginBottom: 20 }}
          done={done}
          total={stages.length}
          current={current === null ? null : { title: current.title, state: current.state as StageStateKey }}
          stageDueOn={current === null ? null : formatDate(current.dueOn)}
          projectDueOn={formatDate(project.dueOn)}
          action={action}
          actionHref={current === null || action === null ? null : `/cabinet/stages/${current.id}`}
        />

      {/* Две колонки, а не три: колонка «Материалы» с панели снята по
          требованию заказчика, а по горизонтали помещается не более двух
          плашек — иначе они ужимаются и наезжают (решение Р-189).
          Материалы никуда не делись: у них свой экран, и на него ведёт
          строка под планом работ. */}
      <Board columns={2}>
        <BoardColumn
          title="План работ"
          href={`/cabinet/projects/${project.code}/materials`}
          hrefLabel={
            materials.length === 0
              ? 'материалы'
              : `материалы · ${materials.length}`
          }
        >
          <Roadmap items={roadmap} />
        </BoardColumn>

        {mayWrite ? (
          <BoardColumn
            title={forClient ? 'Переписка с куратором' : 'Переписка с клиентом'}
            href={`/cabinet/projects/${project.code}/messages`}
            hrefLabel={unread > 0 ? `вся · ${unread} новых` : 'вся переписка'}
            anchor="end"
            footer={
              <Form action={postMessage} inline>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="code" value={project.code} />
                {/* Отправив отсюда, человек остаётся на экране заказа. */}
                <input type="hidden" name="back" value="project" />
                <Field
                  label="Сообщение"
                  name="body"
                  required
                  labelHidden
                  placeholder={forClient ? 'Написать куратору' : 'Написать клиенту'}
                  minWidth={140}
                />
                <Button>Отправить</Button>
              </Form>
            }
          >
            <Thread
              dense
              messages={thread}
              viewer={actor}
              flagContacts={can(actor, 'COMMENT_MODERATE', ref)}
              empty={forClient ? 'Переписки пока нет — напишите куратору.' : 'Переписки пока нет.'}
            />
          </BoardColumn>
        ) : null}
      </Board>

      {/* Ниже — то, что нужно не каждый раз: история и служебные действия.
          На виду они занимали пол-экрана, пересказывая этапы и переписку. */}
      <Disclosure title="История работы" style={{ marginTop: 20 }}>
          {events.length === 0 ? (
            <Text muted>Событий пока нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {events.map((event) => (
                <li key={event.id}>
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
      </Disclosure>

      {mayEdit || mayAssign || maySetManager || maySeeContacts ? (
        <Disclosure title="Управление работой" style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gap: 20 }}>
              {mayEdit ? (
                <Form action={createStage}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <Field
                    label="Новый этап"
                    name="title"
                    required
                    placeholder="Глава 2. Модель отказов лимитирующих узлов"
                    hint="Название свободное; состояние выбирается на экране этапа из пяти."
                  />
                  <FormActions>
                    <Button tone="quiet">Добавить этап</Button>
                  </FormActions>
                </Form>
              ) : null}

              {mayAssign ? (
                <Form action={setExpert}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <Select
                    label="Исполнитель"
                    name="expertId"
                    defaultValue={project.expertId ?? ''}
                    hint="Без договора поручения обработки персональных данных исполнитель не получит доступа к материалам клиента, даже будучи назначенным."
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
                  </Select>
                  <FormActions>
                    <Button tone="quiet">Сохранить исполнителя</Button>
                  </FormActions>
                </Form>
              ) : null}

              {maySetManager ? (
                <Form action={setManager}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <Select
                    label="Передать работу"
                    name="managerId"
                    defaultValue={project.managerId}
                    hint="Клиент увидит смену куратора: меняется тот, кому он пишет."
                  >
                    {curatorList.map((curator) => (
                      <option key={curator.id} value={curator.id}>
                        {curator.fullName}
                        {curator.role === 'HEAD' ? ' — руководитель' : ''}
                      </option>
                    ))}
                  </Select>
                  <FormActions>
                    <Button tone="quiet">Сохранить куратора</Button>
                  </FormActions>
                </Form>
              ) : null}

              {maySeeContacts ? (
                <div>
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

              {can(actor, 'CONTRACT_VIEW', ref) && !forClient ? (
                <div>
                  <ButtonLink href={`/cabinet/projects/${project.code}/payments`}>
                    Оплаты и документы
                  </ButtonLink>
                </div>
              ) : null}
            </div>
        </Disclosure>
      ) : null}
    </Shell>
  );
}
