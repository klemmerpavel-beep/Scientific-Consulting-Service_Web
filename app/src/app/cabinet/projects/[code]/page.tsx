import { notFound, redirect } from 'next/navigation';

import { MONO } from '../../../../components/cabinet/tokens';
import Shell from '../../../../components/cabinet/Shell';
import {
  Board,
  BoardColumn,
  Button,
  ButtonLink,
  Chip,
  Disclosure,
  Field,
  FileField,
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
  plural,
  formatDate,
  formatDay,
  formatSize,
  formatTime,
  type MaterialRow,
  type RoadmapItem,
  type StageStateKey,
} from '../../../../components/cabinet/ui';
import { SANS } from '../../../../components/cabinet/tokens';
import { can } from '../../../../lib/cabinet/access';
import { CONTACT_LABEL, contactsOf } from '../../../../lib/cabinet/channels';
import { stageLabel } from '../../../../lib/cabinet/stage-state';
import { daysPast } from '../../../../lib/cabinet/clock';
import { listMessages, unreadCount } from '../../../../lib/cabinet/messages';
import {
  curators,
  experts,
  projectByCode,
  projectMaterials,
} from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';
import {
  createStage,
  postMessage,
  saveProject,
  saveStage,
  setExpert,
  setManager,
  uploadMaterialWithNote,
} from '../../actions';

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

/**
 * Строка истории: что именно произошло, а не какого рода было событие.
 *
 * Прежде история писала «Этап сменил состояние» — двенадцать одинаковых
 * строк подряд, по которым нельзя восстановить ход работы. Подробности
 * лежат в `payload` с первого спринта и просто не доставались: номер
 * этапа, его название, откуда и куда он перешёл, номер версии материала
 * (решение Р-197).
 */
function eventLine(
  kind: string,
  payload: unknown,
  stages: readonly { id: string; position: number; title: string }[],
  materials: readonly { id: string; title: string }[],
  staff: boolean,
): string {
  const data = (payload ?? {}) as Record<string, unknown>;
  const stage = stages.find((item) => item.id === data.stageId);
  const material = materials.find((item) => item.id === data.materialId);

  if (kind === 'STAGE_STATE_CHANGED') {
    const from = typeof data.from === 'string' ? stageLabel(data.from as StageStateKey, staff) : null;
    const to = typeof data.to === 'string' ? stageLabel(data.to as StageStateKey, staff) : null;
    // Название этапа само нередко содержит двоеточие («Расчётная часть:
    // первая редакция»), поэтому оно берётся в кавычки, а не приписывается
    // через ещё одно двоеточие.
    const where = stage === undefined ? 'Этап' : `Этап ${stage.position} «${stage.title}»`;
    if (to === null) return `${where} — состояние изменено`;
    // Переход описан словами: знак-стрелка — украшение, а правило облика
    // требует штриховых значков, не символов.
    return from === null ? `${where} — ${to}` : `${where} — ${to} (было «${from}»)`;
  }

  if (kind === 'VERSION_UPLOADED') {
    const number = typeof data.version === 'number' ? `версия ${data.version}` : 'новая версия';
    return material === undefined
      ? `Приложена ${number} материала`
      : `Приложена ${number} материала «${material.title}»`;
  }

  return EVENT_LABEL[kind] ?? kind;
}

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
  // Способы связи клиента видит тот же, кто видит его контакты: телефон и
  // ссылка на мессенджер — персональные данные (решение Р-198).
  const clientContacts =
    maySeeContacts && project.client.userId !== null
      ? await contactsOf(actor, ref, project.client.userId)
      : [];
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref);
  const forExpert = actor.role === 'EXPERT';
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
  // Свои замечания, ждущие публикации: до неё клиент их не видит, и
  // эксперт должен понимать, что работа сделана, но ещё не дошла.
  const myPending = (withMaterials?.materials ?? []).reduce(
    (sum, material) =>
      sum +
      material.versions.reduce(
        (inner, version) =>
          inner +
          version.comments.filter(
            (comment) => comment.authorId === actor.id && comment.moderationStatus === 'PENDING',
          ).length,
        0,
      ),
    0,
  );

  const stages = project.stages;
  const done = stages.filter((stage) => stage.state === 'DONE').length;
  // Текущий этап — первый незавершённый; он и отвечает на вопрос «где работа».
  const current = stages.find((stage) => stage.state !== 'DONE') ?? null;
  // Действие клиента показывается только клиенту: загрузить материалы и
  // согласовать этап может лишь он, а эксперту и менеджеру та же фраза с
  // главной кнопкой читалась как задание им (решение Р-206).
  const action =
    current === null || !forClient ? null : (ACTION_BY_STATE[current.state as StageStateKey] ?? null);
  const staff = !forClient;

  const roadmap: RoadmapItem[] = stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    state: stage.state as StageStateKey,
    dueOn: formatDate(stage.dueOn),
    late: daysPast(stage.dueOn) !== null,
    href: `/cabinet/stages/${stage.id}`,
    note: stage.state === 'AWAITING_CLIENT' ? stage.blockedReason : null,
    // Суть выполнения этапа пишет куратор; клиенту она отвечает на вопрос
    // «что здесь делают», не заставляя открывать этап (решение Р-190).
    summary: stage.summary,
    // План работ составляет куратор, и правит он его здесь же: уходить за
    // этим на отдельный экран ради одной строки незачем.
    edit: mayEdit ? (
      <Form action={saveStage}>
        <input type="hidden" name="stageId" value={stage.id} />
        <input type="hidden" name="code" value={project.code} />
        <Field
          label="Название этапа"
          name="title"
          scope={stage.id}
          required
          defaultValue={stage.title}
        />
        <Field
          label="Суть выполнения"
          name="summary"
          scope={stage.id}
          multiline
          defaultValue={stage.summary ?? ''}
          hint="Что делается на этапе и чем он заканчивается. Видно клиенту."
        />
        <Field
          label="Срок этапа"
          name="dueOn"
          scope={stage.id}
          type="date"
          defaultValue={stage.dueOn?.toISOString().slice(0, 10) ?? ''}
        />
        <FormActions>
          <Button tone="quiet">Сохранить этап</Button>
        </FormActions>
      </Form>
    ) : undefined,
  }));

  // Счётчик берётся у полного перечня: колонка показывает дюжину, и
  // число, снятое с неё, врало бы у работы с тринадцатью материалами.
  const materialCount = withMaterials?.materials.length ?? 0;
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

  const events = project.events
    .filter((event) => !forClient || !CLIENT_HIDDEN_EVENTS.has(event.kind))
    .map((event) => ({
      id: event.id,
      line: eventLine(event.kind, event.payload, project.stages, withMaterials?.materials ?? [], staff),
      at: `${formatDay(event.createdAt)}, ${formatTime(event.createdAt)}`,
      who:
        event.actor === null
          ? null
          : authorName(event.actor, actor, event.actorId ?? undefined),
    }));

  // Короткое описание работы. На виду остаётся название и срок, остальное
  // — под раскрытием: тема, тип сопровождения, куратор, суть задачи и
  // последние слова сторон (требование заказчика, решение Р-190).
  //
  // Тип работы часто и есть её название — у всего, что перенесено из книги
  // заказов; тема тоже нередко повторяет название другими словами. Ни то,
  // ни другое не печатается дважды.
  const about = [
    project.title === project.serviceType.name
      ? null
      : { term: 'Тип сопровождения', value: project.serviceType.name },
    project.topic === project.title ? null : { term: 'Тема', value: project.topic },
    { term: 'Срок работы', value: formatDate(project.dueOn) ?? 'не назначен' },
    { term: 'Куратор', value: project.manager.fullName },
  ].filter((row) => row !== null);

  // Последнее слово каждой стороны: на чём разговор остановился, видно, не
  // уходя в переписку. Эксперту переписка закрыта, и здесь её тоже нет.
  const fromClient = thread.filter((message) => message.author.role === 'CLIENT');
  const fromStaff = thread.filter((message) => message.author.role !== 'CLIENT');
  // Когда колонка переписки стоит на этом же экране, последние слова в
  // «О работе» повторяли её дословно: одна реплика читалась дважды
  // (решение Р-206). Остаются они там, где переписки на экране нет.
  const lastWords = (mayWrite ? [] : [
    fromClient[fromClient.length - 1] ?? null,
    fromStaff[fromStaff.length - 1] ?? null,
  ])
    .filter((message) => message !== null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

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
      <Disclosure title="О работе" style={{ marginTop: 12 }}>
        <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
          {about.map((row) => (
            <div
              key={row.term}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,170px) minmax(0,1fr)',
                gap: 14,
              }}
            >
              <dt style={{ margin: 0 }}>
                <Text muted size={13}>
                  {row.term}
                </Text>
              </dt>
              <dd style={{ margin: 0 }}>
                <Text size={14}>{row.value}</Text>
              </dd>
            </div>
          ))}
        </dl>
        {project.summary === null ? null : (
          <Text size={14} style={{ marginTop: 14 }}>
            {project.summary}
          </Text>
        )}
        {lastWords.length === 0 ? null : (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid var(--pd-divider)',
              display: 'grid',
              gap: 12,
            }}
          >
            {lastWords.map((message) => (
              <div key={message.id}>
                <Text muted size={13}>
                  {authorName(message.author, actor, message.authorId)} ·{' '}
                  {formatDay(message.createdAt)}, {formatTime(message.createdAt)}
                </Text>
                <Text size={14} style={{ marginTop: 2 }}>
                  {message.body}
                </Text>
              </div>
            ))}
          </div>
        )}
      </Disclosure>

      <ProgressPanel
          style={{ marginTop: 16, marginBottom: 20 }}
          done={done}
          total={stages.length}
          current={current === null ? null : { title: current.title, state: current.state as StageStateKey }}
          stageDueOn={current === null ? null : formatDate(current.dueOn)}
          projectDueOn={formatDate(project.dueOn)}
          stageLate={current !== null && daysPast(current.dueOn) !== null}
          projectLate={current !== null && daysPast(project.dueOn) !== null}
          staff={staff}
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
            materialCount === 0
              ? 'материалы'
              : `материалы · ${materialCount}`
          }
        >
          <Roadmap items={roadmap} staff={staff} />
        </BoardColumn>

        {mayWrite ? (
          <BoardColumn
            title={forClient ? 'Переписка с куратором' : 'Переписка с клиентом'}
            href={`/cabinet/projects/${project.code}/messages`}
            hrefLabel={
              unread > 0
                ? `вся · ${unread} ${plural(unread, 'новое', 'новых', 'новых')}`
                : 'вся переписка'
            }
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
        ) : forExpert ? (
          /* У эксперта переписки нет по устройству (решение Р-150), и
             правая половина панели пустовала. Теперь там его работа:
             что от него ждут, к какому сроку, что ушло на модерацию и
             форма нового материала (решение Р-200). */
          <BoardColumn
            title="Ваша работа"
            href="/cabinet/payout"
            hrefLabel="вознаграждение"
            footer={
              <Form action={uploadMaterialWithNote} encType="multipart/form-data">
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="code" value={project.code} />
                <input type="hidden" name="stageId" value={current?.id ?? ''} />
                <Field
                  label="Название материала"
                  name="title"
                  required
                  placeholder="Глава 2 диссертации"
                />
                <FileField label="Файл" name="file" required />
                <Field
                  label="Пояснение"
                  name="note"
                  multiline
                  placeholder="Что сделано в этой редакции и на что смотреть в первую очередь"
                  hint="Пояснение уходит замечанием к версии: клиент увидит его после публикации куратором."
                />
                <FormActions>
                  <Button>Приложить материал</Button>
                </FormActions>
              </Form>
            }
          >
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <Mono>Что от вас ждут</Mono>
                <Text size={15} style={{ marginTop: 6 }}>
                  {current === null
                    ? stages.length === 0
                      ? 'План работ ещё не заведён: этапы и задание назначит куратор.'
                      : 'Все этапы закрыты — новых заданий по этой работе нет.'
                    : (current.summary ?? 'Куратор не описал этап: спросите его, что требуется.')}
                </Text>
                {current === null ? null : (
                  <Text muted size={13} style={{ marginTop: 6 }}>
                    {`Этап ${current.position}: ${current.title} · ${stageLabel(current.state as StageStateKey, true)}`}
                  </Text>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 18,
                  flexWrap: 'wrap',
                  fontFamily: SANS,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--pd-ink-muted)',
                }}
              >
                {current?.dueOn == null ? null : (
                  <span>
                    срок этапа — {formatDate(current.dueOn)}
                    {daysPast(current.dueOn) === null ? '' : ' · прошёл'}
                  </span>
                )}
                {project.dueOn === null ? null : <span>срок работы — {formatDate(project.dueOn)}</span>}
                <span>
                  {materialCount} {plural(materialCount, 'материал', 'материала', 'материалов')}
                </span>
              </div>

              <div>
                <Mono>Ваши замечания</Mono>
                <Text size={14} style={{ marginTop: 6 }}>
                  {myPending === 0
                    ? 'Замечаний, ждущих публикации, нет.'
                    : `Ждут публикации куратором: ${myPending}. До неё клиент их не видит.`}
                </Text>
              </div>

              {current === null ? null : (
                <div>
                  <ButtonLink href={`/cabinet/stages/${current.id}`}>Открыть текущий этап</ButtonLink>
                </div>
              )}
            </div>
          </BoardColumn>
        ) : null}
      </Board>

      {/* Ниже — то, что нужно не каждый раз: история и служебные действия.
          На виду они занимали пол-экрана, пересказывая этапы и переписку. */}
      <Disclosure title="История работы" tall style={{ marginTop: 20 }}>
          {events.length === 0 ? (
            <Text muted>Событий пока нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {events.map((event) => (
                <li key={event.id}>
                  <Text size={14}>{event.line}</Text>
                  <Text muted size={13} style={{ marginTop: 2 }}>
                    {event.at}
                    {event.who === null ? '' : ` · ${event.who}`}
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
                    scope="new-stage"
                    required
                    placeholder="Глава 2. Модель отказов лимитирующих узлов"
                    hint="Название свободное; состояние выбирается на экране этапа из пяти."
                  />
                  <Field
                    label="Суть выполнения"
                    name="summary"
                    scope="new-stage"
                    multiline
                    placeholder="Что делается на этапе и чем он заканчивается"
                    hint="Видно клиенту в плане работ под раскрытием."
                  />
                  <Field label="Срок этапа" name="dueOn" scope="new-stage" type="date" />
                  <FormActions>
                    <Button tone="quiet">Добавить этап</Button>
                  </FormActions>
                </Form>
              ) : null}

              {mayEdit ? (
                <Form action={saveProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <Field
                    label="Название работы"
                    name="title"
                    scope="project"
                    required
                    defaultValue={project.title}
                  />
                  <Field
                    label="Тема"
                    name="topic"
                    scope="project"
                    defaultValue={project.topic ?? ''}
                  />
                  <Field
                    label="Короткое описание задачи"
                    name="summary"
                    scope="project"
                    multiline
                    defaultValue={project.summary ?? ''}
                    hint="Видно клиенту под раскрытием «О работе»."
                  />
                  <Field
                    label="Срок работы"
                    name="dueOn"
                    scope="project"
                    type="date"
                    defaultValue={project.dueOn?.toISOString().slice(0, 10) ?? ''}
                  />
                  <FormActions>
                    <Button tone="quiet">Сохранить карточку</Button>
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
                  {/* Как человек просил с ним связываться. Куратор держится
                      этого списка, а не звонит наугад (решение Р-198). */}
                  {clientContacts.length === 0 ? null : (
                    <ul
                      style={{
                        margin: '10px 0 0',
                        padding: 0,
                        listStyle: 'none',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      {clientContacts.map((contact) => (
                        <li key={contact.id}>
                          <Text size={13}>
                            {contact.preferred ? 'Предпочитает: ' : ''}
                            {CONTACT_LABEL[contact.kind]}
                            {contact.value === null ? '' : ` — ${contact.value}`}
                          </Text>
                          {contact.note === null ? null : (
                            <Text muted size={13}>
                              {contact.note}
                            </Text>
                          )}
                        </li>
                      ))}
                    </ul>
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
