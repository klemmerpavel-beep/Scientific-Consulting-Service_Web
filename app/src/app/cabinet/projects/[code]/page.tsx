import { notFound } from 'next/navigation';

import { MONO } from '../../../../components/cabinet/tokens';
import ActionError from '../../../../components/cabinet/ActionError';
import { AccessLink } from '../../../../components/cabinet/AccessLink';
import Shell from '../../../../components/cabinet/Shell';
import {
  Notice,
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
import {
  CLOSED_FOR_PRACTICE,
  can,
  staffExpertLine,
  curatorLine,
  EXPERT_ROLE_LABEL,
  expertLine,
  expertRoleLabel,
  presentReturnText,
  workClosed,
  type Actor,
} from '../../../../lib/cabinet/access';
import { CONTACT_LABEL, contactsOf } from '../../../../lib/cabinet/channels';
import { stageLabel } from '../../../../lib/cabinet/stage-state';
import {
  PROJECT_STATUS_ACTION,
  PROJECT_STATUS_LABEL,
  nextProjectStatuses,
} from '../../../../lib/cabinet/project-status';
import { templateLength } from '../../../../lib/cabinet/projects';
import { daysPast } from '../../../../lib/cabinet/clock';
import { listMessages, unreadCount } from '../../../../lib/cabinet/messages';
import {
  curators,
  executorNames,
  experts,
  projectByCode,
  projectMaterials,
  pendingActions,
} from '../../../../lib/cabinet/queries';
import { bookRowOf, paidShare } from '../../../../lib/cabinet/book-row';
import { formatAmount } from '../../../../lib/cabinet/money';
import { paymentDocumentLines } from '../../../../lib/cabinet/finance';
import { requireActor } from '../../../../lib/cabinet/session';
import { flashEntry, formDraft } from '../../../../lib/cabinet/flash';
import {
  createStage,
  dropStage,
  shiftStage,
  planFromTemplate,
  postMessage,
  saveProject,
  saveStage,
  setExpert,
  setManager,
  uploadMaterialWithNote,
  openAccessForClient,
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
  PROJECT_CREATED: 'Работа взята в сопровождение',
  MANAGER_ASSIGNED: 'Работу принял другой менеджер',
  EXPERT_ASSIGNED: 'Назначен куратор',
  PLAN_CHANGED: 'План работ изменён',
  STAGE_DUE_CHANGED: 'Перенесён срок этапа',
  STAGE_STATE_CHANGED: 'Этап сменил состояние',
  STAGE_RETURNED: 'Этап возвращён с замечаниями',
  VERSION_UPLOADED: 'Приложена новая версия материала',
  PROJECT_STATUS_CHANGED: 'Состояние работы изменено',
  STAGE_HANDED_OVER: 'Куратор сдал этап менеджеру',
  STAGE_HANDOVER_RECALLED: 'Куратор отозвал сдачу этапа',
  STAGE_HANDED_BACK: 'Этап возвращён куратору',
};

/**
 * Сдача этапа куратором — внутреннее дело практики: для клиента этап
 * остаётся «В работе» (требование Э-05, решение Р-325).
 */
const CLIENT_HIDDEN_EVENTS = new Set([
  'EXPERT_ASSIGNED',
  'STAGE_HANDED_OVER',
  'STAGE_HANDOVER_RECALLED',
  'STAGE_HANDED_BACK',
]);

/**
 * Строка истории: что именно произошло, а не какого рода было событие.
 *
 * Прежде история писала «Этап сменил состояние» — двенадцать одинаковых
 * строк подряд, по которым нельзя восстановить ход работы. Подробности
 * лежат в `payload` с первого спринта и просто не доставались: номер
 * этапа, его название, откуда и куда он перешёл, номер версии материала
 * (решение Р-197).
 */
/**
 * Номер этапа на момент события: перестановка не перенумеровывает прежние
 * строки истории (требование М-11, решение Р-303).
 */
function atPosition(data: Record<string, unknown>, stage: { position: number }): number {
  return typeof data.position === 'number' ? data.position : stage.position;
}

function eventLine(
  kind: string,
  payload: unknown,
  stages: readonly { id: string; position: number; title: string }[],
  materials: readonly { id: string; title: string }[],
  staff: boolean,
  actor: Actor,
  executors: ReadonlyMap<string, string> = new Map(),
): string {
  const data = (payload ?? {}) as Record<string, unknown>;
  // Назначение исполнителя куратору и руководителю — с именем, снятие —
  // словами (требование М-16, ОМ-24, решение Р-298).
  if (kind === 'EXPERT_ASSIGNED' && (actor.role === 'MANAGER' || actor.role === 'HEAD')) {
    if (data.expertId === null) return 'Куратор снят';
    const name = typeof data.expertId === 'string' ? executors.get(data.expertId) : undefined;
    return name === undefined ? 'Назначен куратор' : `Назначен куратор: ${name}`;
  }
  const stage = stages.find((item) => item.id === data.stageId);
  const material = materials.find((item) => item.id === data.materialId);

  // Возврат клиентом — с текстом замечаний; эксперту — без контактов
  // (решение Р-281, О-5).
  if (kind === 'STAGE_RETURNED') {
    const where = stage === undefined ? 'Этап' : `Этап ${atPosition(data, stage)} «${stage.title}»`;
    const text = presentReturnText(actor, {
      reason: typeof data.text === 'string' ? data.text : null,
      contactHint: data.contactHint === true,
    });
    return text === null ? `${where} возвращён с замечаниями` : `${where} возвращён с замечаниями: ${text}`;
  }

  // Сдача этапа куратором и возврат ему — с номером и названием этапа;
  // причина возврата — в строке (требование Э-05, решение Р-325).
  if (kind === 'STAGE_HANDED_OVER' || kind === 'STAGE_HANDOVER_RECALLED' || kind === 'STAGE_HANDED_BACK') {
    const where = stage === undefined ? 'этап' : `этап ${atPosition(data, stage)} «${stage.title}»`;
    if (kind === 'STAGE_HANDED_OVER') return `Куратор сдал менеджеру ${where}`;
    if (kind === 'STAGE_HANDOVER_RECALLED') return `Куратор отозвал сдачу: ${where}`;
    const reason = typeof data.reason === 'string' && data.reason !== '' ? `: ${data.reason}` : '';
    return `Менеджер вернул куратору ${where}${reason}`;
  }

  if (kind === 'STAGE_STATE_CHANGED') {
    const from = typeof data.from === 'string' ? stageLabel(data.from as StageStateKey, staff) : null;
    const to = typeof data.to === 'string' ? stageLabel(data.to as StageStateKey, staff) : null;
    // Название этапа само нередко содержит двоеточие («Расчётная часть:
    // первая редакция»), поэтому оно берётся в кавычки, а не приписывается
    // через ещё одно двоеточие.
    const where = stage === undefined ? 'Этап' : `Этап ${atPosition(data, stage)} «${stage.title}»`;
    // Согласование названо по способу: вами, куратором по вашему
    // подтверждению или по истечении срока (О-6, решения Р-290, Р-292).
    // Основание пишет практика, и в нём бывают контакты клиента, поэтому
    // эксперту оно не показывается (Р-150).
    const basis = typeof data.reason === 'string' && data.reason !== '' ? data.reason : null;
    if (data.via === 'CLIENT_APPROVE') {
      return actor.role === 'CLIENT' ? `${where} согласован вами` : `${where} согласован клиентом`;
    }
    if (data.via === 'STAFF_FOR_CLIENT') {
      if (actor.role === 'CLIENT') {
        return `${where} согласован менеджером по вашему подтверждению${basis === null ? '' : `: ${basis}`}`;
      }
      return actor.role === 'EXPERT' || basis === null
        ? `${where} согласован за клиента`
        : `${where} согласован за клиента: ${basis}`;
    }
    if (data.via === 'AUTO_ACCEPT') {
      return `${where} принят по истечении срока согласования (п. 7.3 оферты)`;
    }
    if (to === null) return `${where} — состояние изменено`;
    // Переход описан словами: знак-стрелка — украшение, а правило облика
    // требует штриховых значков, не символов. Причина перехода — следом
    // (решение Р-288).
    const line = from === null ? `${where} — ${to}` : `${where} — ${to} (было «${from}»)`;
    return typeof data.reason === 'string' && data.reason !== '' ? `${line}: ${data.reason}` : line;
  }

  // Состав плана — словами: что переставлено, удалено, заведено по шаблону
  // (требование М-11, решение Р-303).
  if (kind === 'PLAN_CHANGED') {
    const title = typeof data.title === 'string' ? `«${data.title}»` : '';
    if (data.action === 'moved') return `План работ изменён: этап ${title} перемещён с ${data.from} на ${data.to} место`;
    if (data.action === 'removed') return `План работ изменён: удалён этап ${data.position} ${title}`;
    if (data.action === 'template') return `План работ заведён по шаблону: этапов — ${data.count}`;
    return 'План работ изменён';
  }

  // Перенос срока — с датами и причиной (требование М-15, решение Р-302).
  if (kind === 'STAGE_DUE_CHANGED') {
    const where = stage === undefined ? 'Этап' : `Этап ${atPosition(data, stage)} «${stage.title}»`;
    const to = typeof data.dueTo === 'string' ? formatDate(new Date(`${data.dueTo}T00:00:00Z`)) : null;
    const line = to === null ? `${where} — срок снят` : `${where} — срок перенесён на ${to}`;
    return typeof data.reason === 'string' && data.reason !== '' ? `${line}: ${data.reason}` : line;
  }

  if (kind === 'PROJECT_STATUS_CHANGED') {
    const to = typeof data.to === 'string' ? data.to : null;
    const line: Record<string, string> = {
      ACTIVE: 'Работа возобновлена',
      PAUSED: 'Работа приостановлена',
      COMPLETED: 'Работа завершена',
      CANCELLED: 'Работа отменена',
    };
    // Причина приостановки и отмены видна в истории (Т-21, Р-299).
    const said = (to === null ? undefined : line[to]) ?? EVENT_LABEL[kind]!;
    return typeof data.reason === 'string' && data.reason !== '' ? `${said}: ${data.reason}` : said;
  }

  if (kind === 'VERSION_UPLOADED') {
    const number = typeof data.version === 'number' ? `версия ${data.version}` : 'новая версия';
    return material === undefined
      ? `Приложена ${number} материала`
      : `Приложена ${number} материала «${material.title}»`;
  }

  return EVENT_LABEL[kind] ?? kind;
}

/**
 * Материалов в колонке видно столько, сколько помещается; остальные —
 * прокруткой. Дюжины хватает: длиннее человек уходит на свой экран, где
 * есть отбор по этапам и полная история версий.
 */
const MATERIALS_IN_COLUMN = 12;

export default async function ProjectScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActor(`/cabinet/projects/${(await params).code}`);

  const { code } = await params;
  // Отказ действия «Управления работой»: причина у своей формы, свёртка
  // раскрыта, поля заполнены введённым (решение Р-279).
  const errorId = (await searchParams).error;
  const failure = await flashEntry(errorId);
  const draft = (await formDraft(errorId)) ?? {};
  const manageOpen =
    failure?.slot !== undefined && ['project', 'status', 'expert', 'manager'].includes(failure.slot);
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
  // План работ меняется только у действующей работы: этапы
  // приостановленной, завершённой и отменённой не правятся (решение Р-240).
  const mayEditStages = mayEdit && project.status === 'ACTIVE';
  // Шаблон типа — для кнопки «Завести план по шаблону» (М-11, Р-303).
  const templateSize = mayEditStages && project.stages.length === 0 ? await templateLength(actor, project.id) : 0;
  // Закрытая работа — только чтение: карточка и исполнитель не правятся,
  // остаётся «Возобновить» (требование М-10, решение Р-293).
  const closed = workClosed(project.status);
  const mayAssign = can(actor, 'PROJECT_ASSIGN_EXPERT', ref) && !closed;
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
  //
  // Ход клиента ищется на любом этапе, тем же перечнем, что у «Моих
  // работ»: прежде карточка смотрела только на первый незавершённый этап и
  // молчала, когда материалы ждал третий (решение Р-287). Перечень берёт
  // только действующие работы — у приостановленной и закрытой клиент
  // ничего не делает (Р-240).
  const yourTurn = forClient
    ? (await pendingActions(actor)).filter((stage) => stage.projectId === project.id)
    : [];
  const first = yourTurn[0] ?? null;
  const action =
    first === null
      ? null
      : [
          first.state === 'AWAITING_CLIENT'
            ? `От вас ждут материалы к этапу «${first.title}».`
            : `От вас ждут согласования этапа «${first.title}».`,
          // Срок согласования вместо срока этапа (Т-15, решение Р-290).
          first.state === 'IN_APPROVAL' && first.approvalDueOn !== null
            ? `Срок согласования — до ${formatDate(first.approvalDueOn)} включительно.`
            : first.dueOn === null
              ? null
              : `Срок этапа — ${formatDate(first.dueOn)}.`,
          yourTurn.length > 1 ? `Ещё дел: ${yourTurn.length - 1}.` : null,
        ]
          .filter((part) => part !== null)
          .join(' ');
  const staff = !forClient;

  const roadmap: RoadmapItem[] = stages.map((stage, index) => ({
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
    edit: mayEditStages ? (
      <>
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
        {/* Смена срока — с причиной для клиента (М-15, Р-302). */}
        <Field
          label="Причина переноса срока"
          name="reason"
          scope={stage.id}
          hint="Нужна, только если срок меняется: клиент получит её письмом."
        />
        <FormActions>
          <Button tone="quiet">Сохранить этап</Button>
        </FormActions>
      </Form>
      {/* Состав плана: перестановка и удаление не начатого этапа
          (требование М-11, решение Р-303). */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        {index > 0 ? (
          <Form action={shiftStage} inline>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="code" value={project.code} />
            <input type="hidden" name="direction" value="up" />
            <Button tone="quiet">Выше</Button>
          </Form>
        ) : null}
        {index < stages.length - 1 ? (
          <Form action={shiftStage} inline>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="code" value={project.code} />
            <input type="hidden" name="direction" value="down" />
            <Button tone="quiet">Ниже</Button>
          </Form>
        ) : null}
        {stage.state === 'NOT_STARTED' ? (
          <Form action={dropStage} inline>
            <input type="hidden" name="stageId" value={stage.id} />
            <input type="hidden" name="code" value={project.code} />
            <Button tone="quiet">Удалить этап</Button>
          </Form>
        ) : null}
      </div>
      </>
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

  const executors = await executorNames(
    actor,
    project.events
      .filter((event) => event.kind === 'EXPERT_ASSIGNED')
      .map((event) => (event.payload as { expertId?: unknown } | null)?.expertId)
      .filter((id): id is string => typeof id === 'string'),
  );
  // Документы оплат в истории — с названием транша; события о документах
  // скрытых траншей не показываются (требование Т-19, решение Р-315).
  const documents = await paymentDocumentLines(actor, project.id);
  const documentOf = (payload: unknown): string | null => {
    const id = (payload as { materialId?: unknown } | null)?.materialId;
    return typeof id === 'string' ? id : null;
  };
  const events = project.events
    .filter((event) => !forClient || !CLIENT_HIDDEN_EVENTS.has(event.kind))
    .filter((event) => event.kind !== 'VERSION_UPLOADED' || !documents.hidden.has(documentOf(event.payload) ?? ''))
    .map((event) => ({
      id: event.id,
      line:
        (event.kind === 'VERSION_UPLOADED' ? documents.lines.get(documentOf(event.payload) ?? '') : undefined) ??
        eventLine(
          event.kind,
          event.payload,
          project.stages,
          withMaterials?.materials ?? [],
          staff,
          actor,
          executors,
        ),
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
    // Менеджер — с регалиями, но только практике: клиенту имя менеджера не
    // показывается (Э-01, ответ ОЭ-3б). Куратор — регалиями без ФИО и
    // контактов; пустые части не выводятся (требование Т-11, Р-297).
    forClient ? null : { term: 'Менеджер', value: curatorLine(project.manager) },
    // Практике — куратор по имени, с ролью в работе и отметкой о договоре
    // поручения (требование М-16, решение Р-298); клиенту и самому куратору —
    // «Куратор» и регалии при любой роли (Э-01, ответ ОЭ-3а).
    project.expert === null
      ? null
      : {
          term: 'Куратор',
          value:
            actor.role === 'MANAGER' || actor.role === 'HEAD'
              ? `${project.expert.fullName} · ${expertRoleLabel(project.expertRole).toLowerCase()}${project.expert.expertProfile?.ndaSignedAt == null ? ' · без договора поручения' : ''}`
              : expertLine(project.expert.expertProfile) || 'назначен',
        },
  ].filter((row) => row !== null);

  // Строка книги заказов, из которой заведена работа, — как записана в
  // книге, со статусом и сроком словами (решение Р-269).
  const bookRow = staff ? await bookRowOf(actor, project.id) : null;
  const bookFacts =
    bookRow === null
      ? []
      : [
          { term: 'Дата заказа', value: formatDate(bookRow.orderDate) ?? '—' },
          { term: 'Заказчик (ФИО)', value: bookRow.customer || '—' },
          { term: 'Тип работы', value: bookRow.type || '—' },
          { term: 'Описание работы', value: bookRow.description || '—' },
          {
            term: 'Дедлайн',
            value:
              /^\d{4,6}(\.\d+)?$/u.test(bookRow.deadline) && bookRow.deadlineDate !== null
                ? (formatDate(bookRow.deadlineDate) ?? bookRow.deadline)
                : bookRow.deadline || '—',
          },
          { term: 'Стоимость', value: formatAmount(bookRow.cost) },
          { term: 'Оплачено', value: formatAmount(bookRow.paid) },
          { term: 'Доля оплаты', value: paidShare(bookRow) ?? '—' },
          { term: 'Статус в книге', value: bookRow.status || '—' },
          { term: 'Источник', value: `${bookRow.fileName}, строка ${bookRow.rowNumber}` },
        ];

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
        {/* Состояние печатается, только когда работа не действует: у
            действующей оно подразумевается (решение Р-223). */}
        {project.status === 'ACTIVE' ? null : (
          <Chip>{PROJECT_STATUS_LABEL[project.status]}</Chip>
        )}
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
      <ActionError id={errorId} />
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

      {bookFacts.length === 0 ? null : (
        <Disclosure title="Строка книги заказов" tall style={{ marginTop: 10 }}>
          <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
            {bookFacts.map((row) => (
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
        </Disclosure>
      )}

      <ProgressPanel
          style={{ marginTop: 16, marginBottom: 20 }}
          done={done}
          total={stages.length}
          current={
            current === null
              ? null
              : { title: current.title, state: current.state as StageStateKey, handedOverAt: current.handedOverAt ?? null }
          }
          stageDueOn={current === null ? null : formatDate(current.dueOn)}
          projectDueOn={formatDate(project.dueOn)}
          stageLate={current !== null && daysPast(current.dueOn) !== null}
          projectLate={current !== null && daysPast(project.dueOn) !== null}
          staff={staff}
          action={action}
          actionHref={first === null ? null : `/cabinet/stages/${first.id}`}
          waiting={forClient ? first !== null : undefined}
          projectStatus={project.status}
          // Исполнитель под шкалой — у практики (требование М-16, ОМ-23).
          executor={
            actor.role === 'MANAGER' || actor.role === 'HEAD'
              ? staffExpertLine(project.expert, project.expertNameRaw)
              : null
          }
          turnViewer={
            actor.role === 'EXPERT'
              ? 'expert'
              : actor.role === 'HEAD' && project.managerId !== actor.id
                ? 'foreign-head'
                : 'curator'
          }
          hasExpert={project.expertId !== null || (project.expertNameRaw ?? '').trim() !== ''}
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
          // Договор и акты клиент находит здесь, а не через переписку; у
          // сотрудников экран оплат — в «Управлении работой» (решение Р-280).
          extra={
            forClient && can(actor, 'CONTRACT_VIEW', ref)
              ? { href: `/cabinet/projects/${project.code}/payments`, label: 'Оплаты и документы' }
              : undefined
          }
        >
          <Roadmap items={roadmap} staff={staff} />
        </BoardColumn>

        {mayWrite ? (
          <BoardColumn
            title={forClient ? 'Переписка с менеджером' : 'Переписка с клиентом'}
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
                  placeholder={forClient ? 'Написать менеджеру' : 'Написать клиенту'}
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
              empty={forClient ? 'Переписки пока нет — напишите менеджеру.' : 'Переписки пока нет.'}
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
                  hint="Пояснение уходит замечанием к версии: клиент увидит его после публикации менеджером."
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
                      ? 'План работ ещё не заведён: этапы и задание назначит менеджер.'
                      : 'Все этапы закрыты — новых заданий по этой работе нет.'
                    : (current.summary ?? 'Менеджер не описал этап: спросите его, что требуется.')}
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
                    : `Ждут публикации менеджером: ${myPending}. До неё клиент их не видит.`}
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
        <Disclosure title="Управление работой" open={manageOpen} id="manage" style={{ marginTop: 10 }}>
            <div style={{ display: 'grid', gap: 20 }}>
              {mayEditStages ? (
                <>
                {/* Пустой план заводится по шаблону типа одним действием
                    (требование М-11, решение Р-303). */}
                {stages.length === 0 && templateSize > 0 ? (
                  <Form action={planFromTemplate} inline>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="code" value={project.code} />
                    <Button tone="quiet">
                      {`Завести план по шаблону · ${templateSize} ${plural(templateSize, 'этап', 'этапа', 'этапов')}`}
                    </Button>
                  </Form>
                ) : null}
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
                </>
              ) : null}

              {/* Смена состояния — в два шага: выбор здесь, последствия,
                  причина для клиента и подтверждение — на отдельном экране
                  (требование М-09, решение Р-299). */}
              {mayEdit ? (
                <Form action={`/cabinet/projects/${project.code}/status`} method="get">
                  <Select
                    label="Состояние работы"
                    name="to"
                    required
                    defaultValue=""
                    hint={`Сейчас: ${PROJECT_STATUS_LABEL[project.status].toLowerCase()}. На следующем шаге — последствия, причина для клиента и подтверждение.`}
                  >
                    <option value="">— выберите действие —</option>
                    {nextProjectStatuses(project.status).map((status) => (
                      <option key={status} value={status}>
                        {PROJECT_STATUS_ACTION[status]}
                      </option>
                    ))}
                  </Select>
                  <FormActions>
                    <Button tone="quiet">Продолжить</Button>
                  </FormActions>
                </Form>
              ) : null}

              {mayEdit && closed ? (
                <Text muted size={14}>
                  {CLOSED_FOR_PRACTICE}. Карточка, куратор и этапы закрытой работы не
                  меняются; переписка и документы оплат доступны.
                </Text>
              ) : null}

              {mayEdit && !closed ? (
                <Form action={saveProject}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <ActionError id={errorId} slot="project" />
                  <Field
                    label="Название работы"
                    name="title"
                    scope="project"
                    required
                    defaultValue={draft.title ?? project.title}
                  />
                  <Field
                    label="Тема"
                    name="topic"
                    scope="project"
                    defaultValue={draft.topic ?? project.topic ?? ''}
                  />
                  <Field
                    label="Короткое описание задачи"
                    name="summary"
                    scope="project"
                    multiline
                    defaultValue={draft.summary ?? project.summary ?? ''}
                    hint="Видно клиенту под раскрытием «О работе»."
                  />
                  <Field
                    label="Срок работы"
                    name="dueOn"
                    scope="project"
                    type="date"
                    defaultValue={draft.dueOn ?? project.dueOn?.toISOString().slice(0, 10) ?? ''}
                  />
                  {/* Срок согласования этапа — по п. 7.2 оферты не меньше
                      пяти рабочих дней (требование Т-15, решение Р-290). */}
                  <Field
                    label="Срок согласования этапа, рабочих дней"
                    name="approvalDays"
                    scope="project"
                    type="number"
                    required
                    defaultValue={draft.approvalDays ?? String(project.approvalDays)}
                    hint="От 5 до 20. Новое число действует со следующей сдачи этапа на согласование."
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
                  <ActionError id={errorId} slot="expert" />
                  <Select
                    label="Куратор"
                    name="expertId"
                    defaultValue={draft.expertId ?? project.expertId ?? ''}
                    hint="Без договора поручения обработки персональных данных куратор не получит доступа к материалам клиента, даже будучи назначенным."
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
                  {/* Назначен без договора поручения: работа молча вставала —
                      эксперт не видел материалов (требование М-16, Р-298). */}
                  {project.expert !== null && project.expert.expertProfile?.ndaSignedAt == null ? (
                    <Notice tone="quiet" role="status">
                      {`${project.expert.fullName} назначен без договора поручения: материалов клиента он не увидит, пока руководитель не отметит договор. ${
                        actor.role === 'MANAGER'
                          ? 'Руководителю отправлен вопрос.'
                          : 'Отметить договор можно в «Учётных записях».'
                      }`}
                    </Notice>
                  ) : null}
                  {/* Роль эксперта в работе — так его видит клиент вместо
                      ФИО (требование Т-11, О-10, решение Р-297). */}
                  <Select
                    label="Роль куратора в работе"
                    name="expertRole"
                    defaultValue={draft.expertRole ?? project.expertRole ?? 'SUBJECT_EXPERT'}
                    hint="Роль — для практики. Клиент видит «Куратор», степень и специальность — без имени и контактов."
                  >
                    {(Object.keys(EXPERT_ROLE_LABEL) as (keyof typeof EXPERT_ROLE_LABEL)[]).map((role) => (
                      <option key={role} value={role}>
                        {EXPERT_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </Select>
                  <FormActions>
                    <Button tone="quiet">Сохранить куратора</Button>
                  </FormActions>
                </Form>
              ) : null}

              {maySetManager ? (
                <Form action={setManager}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <ActionError id={errorId} slot="manager" />
                  <Select
                    label="Передать работу"
                    name="managerId"
                    defaultValue={draft.managerId ?? project.managerId}
                    hint="Клиент увидит смену менеджера: меняется тот, кому он пишет."
                  >
                    {curatorList.map((curator) => (
                      <option key={curator.id} value={curator.id}>
                        {curator.fullName}
                        {curator.role === 'HEAD' ? ' — руководитель' : ''}
                      </option>
                    ))}
                  </Select>
                  <FormActions>
                    <Button tone="quiet">Сохранить менеджера</Button>
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
                  {/* Вход клиенту открывает куратор работы: прежде это умел
                      только руководитель, и клиенты ручных заказов в кабинет
                      не попадали (решение Р-285). */}
                  {can(actor, 'CLIENT_ACCESS_OPEN', ref) ? (
                    <div style={{ marginTop: 14 }}>
                      {project.client.userId === null && (project.client.email ?? '').trim() === '' ? (
                        <Text muted size={13}>
                          Чтобы открыть клиенту вход в кабинет, нужен адрес почты в его карточке.
                        </Text>
                      ) : (
                        <AccessLink
                          people={[
                            {
                              id: project.id,
                              label: `${project.client.fullName}${project.client.email === null ? '' : ` · ${project.client.email}`}`,
                            },
                          ]}
                          action={openAccessForClient}
                          field="projectId"
                          selectLabel="Открыть вход в кабинет"
                          submitLabel="Открыть клиенту вход"
                        />
                      )}
                    </div>
                  ) : null}
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
