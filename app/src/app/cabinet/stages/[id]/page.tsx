import type { ReactNode } from 'react';
import {
  notFound,
  redirect } from 'next/navigation';  import Shell from '../../../../components/cabinet/Shell'; import { MONO } from '../../../../components/cabinet/tokens'; import {   Button,
  ButtonLink,
  Block,
  Card,
  Chip,
  Disclosure,
  Field,
  FileField,
  Form,
  FormActions,
  Heading,
  Mono,
  Notice,
  Outcome,
  ScreenHead,
  stageLabel,
  Text,
  formatDate,
  formatDay,
  versionState,
  authorName,
  formatSize,
  plural,
  type StageStateKey,
  turnLabel,
} from '../../../../components/cabinet/ui';
import { curatorWorkLine } from '../../../../lib/cabinet/stage-state';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  can,
  contributionRefusal,
  presentBlockedReason,
  presentReturnText,
  staffExpertLine,
  workClosed,
} from '../../../../lib/cabinet/access';
import { autoAcceptEnabled } from '../../../../lib/cabinet/approval';
import { approvalStaffLine } from '../../../../lib/cabinet/approval-text';
import { flashEntry, formDraft } from '../../../../lib/cabinet/flash';
import { COMMENT_MAX } from '../../../../lib/cabinet/materials';
import { RETURN_TEXT_MAX, stagePaperwork } from '../../../../lib/cabinet/projects';
import { dueMovedJustNow, hasNextStage, pendingActions, stageById, stageClientWait } from '../../../../lib/cabinet/queries';
import { daysPast, moscowToday, now as clockNow } from '../../../../lib/cabinet/clock';
import {
  OUTCOME_ANCHOR,
  OUTCOME_FLAGS,
  PUBLISHED_LINE,
  approvalSentLine,
  approvedLine,
  clientNextLabel,
  dueMovedLine,
  inOutcomeWindow,
} from '../../../../lib/cabinet/outcome-lines';
import { noticeFate } from '../../../../lib/cabinet/outbox';
import DropFlag from '../../../../components/cabinet/DropFlag';
import ActionError from '../../../../components/cabinet/ActionError';
import CommentList from '../../../../components/cabinet/CommentList';
import { handoverOf, stageStateButtons } from '../../../../lib/cabinet/stage-state';
import { curatorStageLine, pendingVersionsLine, staffStageTodo } from '../../../../lib/cabinet/stage-todo';
import {
  PROJECT_STATUS_LABEL,
  type ProjectStatusKey,
} from '../../../../lib/cabinet/project-status';
import { requireActor } from '../../../../lib/cabinet/session';
import {
  acknowledgeStageReturn,
  approveForClient,
  handBackStageAction,
  handOverStageAction,
  recallHandoverAction,
  reopenStageAction,
  approveStage,
  changeStageState,
  returnStageWithRemarks,
  saveStageOutcome,
  commentOnVersion,
  decideOnComment,
  decideOnVersion,
  moveStageDue,
  uploadMaterial,
} from '../../actions';

import { nextStageUnpaid } from '../../../../lib/cabinet/head-checks';

export const dynamic = 'force-dynamic';

/** Переходы, которые менеджер может выполнить с этого состояния. */

/*
 * Подсказки «Что сделать сейчас» — по фактическому состоянию и ходу, в
 * чистом модуле `lib/cabinet/stage-todo.ts` (решение Р-723; закрытый
 * последний этап — Р-710, согласование без замечаний — Р-254).
 */

/**
 * Сколько дней прошло с назначенного срока; до срока — ничего. День
 * берётся у часов кабинета, а не у системных: снимок не должен
 * зависеть от дня съёмки (решение Р-205).
 */
const overdueDays = (dueOn: Date | null): number | null => daysPast(dueOn);


// Ссылка в строке исхода — подчёркнута цветом строки: следующее дело
// клиента (решение Р-725).
const OUTCOME_LINK = { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 } as const;

// Ссылка в строке фактов — подчёркнута: одним цветом ссылка среди
// подписей не отличается (Р-168, решение Р-723).
const FACT_LINK = {
  color: 'var(--pd-accent)',
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  textDecorationThickness: 1,
} as const;

// Ссылка на оферту — строчная, как в форме заявки: подпись переносится как
// текст, а цель нажатия добирается до 44 пикселей отступом (Р-253).
const OFFER_LINK = {
  color: 'var(--pd-accent)',
  padding: '14px 0',
} as const;

/**
 * Предел длины в подсказках полей — тот же, что у служб, с разрядом; файлы
 * — в материалах (решение Р-722).
 */
const TEXT_LIMIT = `До ${COMMENT_MAX.toLocaleString('ru-RU')} знаков; файлы — в материалах работы.`;

/** Подпись состояния стоит отдельной строкой — с прописной буквы. */
function sentence(text: string | null): string {
  return text === null ? '' : text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function StageScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; done?: string; published?: string }>;
}) {
  const actor = await requireActor(`/cabinet/stages/${(await params).id}`);

  const { id } = await params;
  const stage = await stageById(actor, id);
  if (stage === null) notFound();

  const ref = stage.project;
  const state = stage.state as StageStateKey;
  // Этапы меняются только у действующей работы (решение Р-240): у
  // приостановленной, завершённой и отменённой кнопки перевода, переноса
  // срока и согласования не показываются — действие всё равно отказало бы.
  const live = stage.project.status === 'ACTIVE';
  const mayEdit = live && can(actor, 'STAGE_SET_STATE', ref);
  const mayApprove = live && state === 'IN_APPROVAL' && can(actor, 'STAGE_APPROVE', ref);
  // Вернуть с замечаниями может только сам клиент (решение Р-281).
  const mayReturn = live && state === 'IN_APPROVAL' && can(actor, 'STAGE_RETURN', ref);
  // Пометка «возвращён с замечаниями» стоит до новой сдачи этапа.
  const lastReturn = stage.returnedAt === null ? undefined : stage.changes[0];
  // Отказ возвращает набранные замечания или итог этапа в поле
  // (решения Р-279, Р-289); замечание, комментарий и загрузку — в
  // раскрытую свёртку своей формы, с причиной у неё (решение Р-722).
  const errorId = (await searchParams).error;
  const failure = await flashEntry(errorId);
  const draft = (await formDraft(errorId)) ?? {};
  const returnText = lastReturn === undefined ? null : presentReturnText(actor, lastReturn);
  // На закрытом этапе клиенту не предлагается приложить «первый» материал:
  // этап сдан, и новая загрузка в него ничего не сдвинет (решение Р-206).
  // Закрытая работа — только чтение всем ролям, завершённый этап — клиенту
  // и эксперту; правило одно для экрана и служб (Т-17, М-10, Р-293).
  const refusal = contributionRefusal(actor, stage.project.status, state);
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref) && refusal === null;
  const mayComment = can(actor, 'COMMENT_CREATE', ref) && refusal === null;
  const staff = actor.role !== 'CLIENT';
  const mayModerate = can(actor, 'COMMENT_MODERATE', ref) && refusal === null;
  const forStaff = actor.role !== 'CLIENT' && mayEdit;
  const late = overdueDays(stage.dueOn);
  // Следующий этап — только для подсказки закрытого этапа (решение Р-710).
  const hasNext = forStaff && state === 'DONE' ? await hasNextStage(actor, stage) : false;
  // Акты и оплаченные транши — предупреждение перед возвратом этапа (ОМ-21).
  const paperwork =
    state === 'DONE' && live && can(actor, 'STAGE_SET_STATE', ref) && actor.role !== 'CLIENT'
      ? await stagePaperwork(actor, stage.project.id)
      : null;
  // Срок согласования глазами практики: та же дата, что у клиента, и
  // закроется ли этап сам (требование М-13, решение Р-291).
  const approvalLine =
    can(actor, 'STAGE_SET_STATE', ref) && state === 'IN_APPROVAL'
      ? approvalStaffLine({
          dueOn: stage.approvalDueOn,
          daysLeft: stage.approvalDaysLeft,
          clientHasLogin: stage.project.client.userId !== null,
          autoAccept: autoAcceptEnabled(),
        })
      : null;
  // Этап ждал клиента — срок можно перенести на те же дни по п. 8.2
  // оферты (часть F, МП-05, решение Р-381).
  const waited =
    forStaff && state !== 'DONE' && stage.dueOn !== null
      ? await stageClientWait(actor, stage.id, clockNow())
      : { days: 0, until: null };
  // Сдача этапа куратором менеджеру — пометка без нового состояния
  // (требование Э-05, решение Р-325).
  const handover = handoverOf(stage);
  const curatorView = actor.role === 'EXPERT';
  const blockedForCurator = curatorView ? presentBlockedReason(actor, stage.blockedReason) : null;
  const mayHandOver = state === 'IN_PROGRESS' && refusal === null && can(actor, 'STAGE_HAND_OVER', ref);
  // Сдачу закрытой работы не возвращают: работа только для чтения (Р-523).
  const mayHandBack = handover === 'handed' && !workClosed(stage.project.status) && can(actor, 'STAGE_HAND_BACK', ref);
  // Транш следующего этапа не оплачен — подсказка практике; перевод этапа
  // она не запрещает (требование РК-12, решение Р-338).
  const nextUnpaid = mayEdit && state !== 'DONE' ? await nextStageUnpaid(actor, stage.id) : false;
  // Сдать можно, когда приложена своя версия, не отклонённая менеджером (Д-3).
  const ownVersions = stage.materials
    .flatMap((material) => material.versions)
    .filter((version) => version.uploadedById === actor.id && version.moderation?.status !== 'REJECTED').length;
  // Последние материалы клиента — до трёх версий, новые сверху (Д-5).
  const clientVersions = stage.materials
    .flatMap((material) => material.versions.map((version) => ({ material, version })))
    .filter((row) => row.version.uploadedBy.role === 'CLIENT')
    .sort((a, b) => b.version.uploadedAt.getTime() - a.version.uploadedAt.getTime())
    .slice(0, 3);
  // Формы, у которых стоит причина отказа. Формы нет на экране — этап ушёл
  // с согласования, работа закрыта — причина выводится вверху (Р-722).
  // Условие формы комментария — то же, что у самой формы ниже (Р-671).
  const commentForm = (version: (typeof stage.materials)[number]['versions'][number]) =>
    mayComment && !(curatorView && version.moderation?.status === 'REJECTED');
  const placed: Record<string, boolean> = {
    return: mayApprove && actor.role === 'CLIENT' && mayReturn,
    comment: stage.materials.some(
      (material) => material.versions[0]?.id === draft.commentVersion && commentForm(material.versions[0]),
    ),
    upload: mayUpload && (draft.upload === 'new' || stage.materials.some((material) => material.id === draft.upload)),
  };
  const unplaced = Object.keys(placed).filter((slot) => !placed[slot]);
  const pendingComments = stage.materials.reduce(
    (sum, material) =>
      sum +
      material.versions.reduce(
        (inner, version) =>
          inner + version.comments.filter((comment) => comment.moderationStatus === 'PENDING').length,
        0,
      ),
    0,
  );
  // Версии куратора, ждущие публикации клиенту: строка фактов называет их
  // и ведёт к первой на этом же экране (решение Р-723; публикация — Р-294).
  const pendingVersions = forStaff
    ? stage.materials.flatMap((material) => material.versions).filter((version) => version.moderation?.status === 'PENDING')
    : [];
  // «Что сделать сейчас» практике — по сдаче, возврату, материалу, версиям
  // на публикации и просрочке (Р-723).
  const todo = staffStageTodo({
    state,
    handedOver: handover === 'handed',
    materials: stage.materials.length,
    pendingVersions: pendingVersions.length,
    pendingComments,
    returnedUnacked: lastReturn !== undefined && stage.returnAckAt === null,
    hasNext,
    lateDays: late,
  });
  // Куратору первой строкой — чей ход с его стороны (Р-288, Р-329, Р-723).
  const curatorLine = curatorStageLine({
    state,
    projectStatus: stage.project.status,
    hasExpert: stage.project.expertId !== null,
    handedOverAt: stage.handedOverAt,
  });
  // У сданного этапа приостановленной или закрытой работы первая строка —
  // о работе, а пометка сдачи остаётся своей строкой «Этап сдан …: ход за
  // менеджером» (Р-723).
  const curatorWork = curatorWorkLine(stage.project.status);
  const handedLine = `${turnLabel(state, 'expert', stage.project.expertId !== null, stage.handedOverAt)}.`;
  // Строка исхода после действия — по признаку в адресе и по данным этапа:
  // признак без подтверждения в данных ничего не выводит (решение Р-725).
  // «Согласован» и «срок перенесён» подтверждаются свежим событием — этап
  // завершён, срок перенесён этим человеком в окне исхода; признак,
  // подставленный в адрес руками, строки не даёт. При отказе признака нет —
  // стоит прежняя причина.
  const { done, published } = await searchParams;
  let outcome: ReactNode = null;
  if (errorId === undefined) {
    if (
      done === 'approved' &&
      actor.role === 'CLIENT' &&
      state === 'DONE' &&
      stage.completedAt !== null &&
      inOutcomeWindow(stage.completedAt)
    ) {
      // Следующее дело клиента по этой работе — тем же перечнем, что у
      // карточки работы (Р-287); дел нет — к работе.
      const next =
        (await pendingActions(actor)).find((row) => row.projectId === stage.project.id && row.id !== stage.id) ?? null;
      outcome = (
        <>
          {`${approvedLine(formatDay(moscowToday(stage.completedAt)))} Дальше — `}
          <a
            href={next === null ? `/cabinet/projects/${stage.project.code}` : `/cabinet/stages/${next.id}`}
            style={OUTCOME_LINK}
          >
            {clientNextLabel(next)}
          </a>
          .
        </>
      );
    } else if (done === 'approval' && forStaff && state === 'IN_APPROVAL') {
      outcome = approvalSentLine(stage.approvalDueOn === null ? null : formatDay(stage.approvalDueOn));
    } else if (done === 'due' && forStaff && stage.dueOn !== null && (await dueMovedJustNow(actor, stage))) {
      // Уведомление клиенту — по очереди уведомлений: строка не обещает
      // письма, которого не будет (Р-163, Р-267).
      const fate = await noticeFate(
        stage.project.client.userId,
        'STAGE_DUE_CHANGED',
        `stage:${stage.id}:due-changed:${stage.dueOn.toISOString().slice(0, 10)}:`,
      );
      outcome = dueMovedLine(formatDate(stage.dueOn) ?? '', fate);
    } else if (
      published !== undefined &&
      mayModerate &&
      stage.materials.some((material) =>
        material.versions.some((version) => version.id === published && version.moderation?.status === 'PUBLISHED'),
      )
    ) {
      outcome = PUBLISHED_LINE;
    }
  }

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={`/cabinet/projects/${stage.project.code}`}
        backLabel={stage.project.title}
        title={stage.title}
        chips={<Chip tone="accent">{stageLabel(state, staff)}</Chip>}
        // Название работы уже стоит ссылкой возврата слева; повторённое
        // строкой ниже, оно занимало ярус и ничего не добавляло
        // (решение Р-206). Состав привлечённых специалистов клиенту не
        // показывается: для него работу ведёт куратор (решение Р-140).
        // Исполнитель — работы, а не этапа: поле этапа не заполнялось, и
        // строка пустовала (требование М-16, решение Р-298).
        note={
          actor.role === 'CLIENT' || actor.role === 'EXPERT'
            ? null
            : staffExpertLine(stage.project.expert, stage.project.expertNameRaw)
        }
        // Просрочка называется всем ролям, а не только куратору: эксперт
        // не узнавал о сорванном сроке своего же этапа (решение Р-206).
        aside={
          stage.dueOn === null
            ? null
            : `срок — ${formatDate(stage.dueOn)}${
                late === null || state === 'DONE'
                  ? ''
                  : ` · прошёл ${late} ${plural(late, 'день', 'дня', 'дней')} назад`
              }`
        }
      />

      <ActionError id={errorId} unplaced={unplaced} />
      {outcome === null ? null : <Outcome id={OUTCOME_ANCHOR}>{outcome}</Outcome>}
      {done === undefined && published === undefined ? null : <DropFlag names={OUTCOME_FLAGS} />}

      {/* Описание этапа, замечания клиента и причина остановки — одним
          блоком: на экране куратора и без них до четырёх блоков (решения
          Р-183, Р-281). Описание целиком: клиент решает о согласовании,
          зная, что входило в этап (Р-190, Р-286). */}
      {/* Куратору — один блок «Что сделать сейчас»: чей ход, описание этапа,
          срок, причина возврата, последние материалы клиента и сдача этапа
          менеджеру (требование Э-05, решение Р-325). Первая строка — ход со
          стороны куратора; сданный этап — первой строкой с запиской и
          отзывом сдачи (решение Р-723). */}
      {curatorView ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Что сделать сейчас
          </Heading>
          {handover === 'handed' && stage.handedOverAt !== null ? (
            <div style={{ marginBottom: 12 }}>
              {curatorWork === null ? null : (
                <Text style={{ marginBottom: 12, fontWeight: 600 }}>{curatorLine.text}</Text>
              )}
              <Notice tone="quiet" role="status">
                {curatorWork === null ? curatorLine.text : handedLine}
                {(stage.handoverNote ?? '').trim() === '' ? null : (
                  <span style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                    {stage.handoverNote}
                  </span>
                )}
              </Notice>
              {can(actor, 'STAGE_HAND_OVER', ref) && refusal === null ? (
                <Form action={recallHandoverAction} inline style={{ marginTop: 12 }}>
                  <input type="hidden" name="stageId" value={stage.id} />
                  <Button tone="quiet">Отозвать сдачу</Button>
                </Form>
              ) : null}
            </div>
          ) : (
            <Text style={{ marginBottom: 12, fontWeight: 600 }}>{curatorLine.text}</Text>
          )}
          {/* Описание этапа написано клиенту: «Нужен ваш выбор журнала» —
              не задание куратору (Р-723). */}
          <Text muted size={13} style={{ marginBottom: 4 }}>
            Описание этапа (его читает клиент)
          </Text>
          <Text size={15} style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>
            {(stage.summary ?? '').trim() === ''
              ? 'Менеджер не описал этап: спросите его письмом, почта — в «О работе» на карточке работы.'
              : stage.summary}
          </Text>
          <Text size={14} style={{ marginBottom: 12 }}>
            {stage.dueOn === null
              ? 'Срок этапа не назначен.'
              : `Срок этапа — ${formatDate(stage.dueOn)}${
                  late === null || state === 'DONE' ? '' : ` · прошёл ${late} ${plural(late, 'день', 'дня', 'дней')} назад`
                }.`}
          </Text>
          {lastReturn === undefined ? null : (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="quiet" role="status">
                {`Клиент вернул этап с замечаниями ${formatDay(lastReturn.createdAt)}`}
                {returnText === null ? null : (
                  <span style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>{returnText}</span>
                )}
              </Notice>
            </div>
          )}
          {handover !== 'handed-back' || stage.handbackAt === null ? null : (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="quiet" role="status">
                {`Менеджер вернул этап ${formatDay(stage.handbackAt)}`}
                <span style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  {stage.handbackReason}
                </span>
              </Notice>
            </div>
          )}
          {/* Причину «ждём материалы» менеджер пишет клиенту: куратору —
              нейтральная пометка, как в истории работы (Р-414, Р-522). */}
          {blockedForCurator === null ? null : (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="quiet" role="status">
                {blockedForCurator}
              </Notice>
            </div>
          )}
          <Text muted size={13} style={{ marginBottom: 4 }}>
            Последние материалы клиента
          </Text>
          {clientVersions.length === 0 ? (
            <Text size={14} style={{ marginBottom: 12 }}>
              Клиент материалов к этапу не прикладывал.
            </Text>
          ) : (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18 }}>
              {clientVersions.map(({ material, version }) => (
                <li key={version.id}>
                  <Text size={14} style={{ margin: 0 }}>
                    {material.title} · v{version.number} · {formatDay(version.uploadedAt)}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          {handover === 'handed' ? null : mayHandOver ? (
            ownVersions === 0 ? (
              <Text muted size={13}>
                Сдать этап менеджеру можно, когда к нему приложена ваша версия материала — загрузите её
                ниже.
              </Text>
            ) : (
              <Form action={handOverStageAction}>
                <input type="hidden" name="stageId" value={stage.id} />
                <Field
                  label="Что сделано и на что обратить внимание клиента"
                  name="note"
                  scope="handover"
                  multiline
                  required
                  defaultValue={draft.note ?? stage.handoverNote ?? ''}
                  hint="Менеджер получит записку вместе с этапом; из неё он соберёт «Итог этапа» для клиента."
                />
                <FormActions>
                  <Button>Сдать этап менеджеру</Button>
                  {/* Проверка перед сдачей — чек-листом куратора (Р-552). */}
                  <ButtonLink href="/cabinet/manage/checklists?view=own#expert-handover">Чек-лист сдачи</ButtonLink>
                </FormActions>
              </Form>
            )
          ) : null}
        </Card>
      ) : (stage.summary ?? '').trim() === '' && stage.blockedReason === null && lastReturn === undefined ? null : (
        <Block as="div" style={{ marginBottom: 24 }}>
          {(stage.summary ?? '').trim() === '' ? null : (
            <Text
              size={15}
              style={{
                whiteSpace: 'pre-wrap',
                marginBottom: stage.blockedReason === null && lastReturn === undefined ? 0 : 14,
              }}
            >
              {stage.summary}
            </Text>
          )}
          {lastReturn === undefined ? null : (
            <Notice tone="quiet" role="status">
              {`Возвращён с замечаниями ${formatDay(lastReturn.createdAt)}`}
              {returnText === null ? null : (
                <span style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>{returnText}</span>
              )}
            </Notice>
          )}
          {/* Дело куратора гаснет отметкой, а не ответом в переписке:
              «приняты в работу» — решение, а не реплика (решение Р-283). */}
          {lastReturn !== undefined && stage.returnAckAt === null && mayEdit ? (
            <Form action={acknowledgeStageReturn} inline style={{ marginTop: 12 }}>
              <input type="hidden" name="stageId" value={stage.id} />
              <Button tone="quiet">Замечания приняты в работу</Button>
            </Form>
          ) : null}
          {stage.blockedReason === null ? null : (
            <div style={{ marginTop: lastReturn === undefined ? 0 : 12 }}>
              <Notice tone="quiet" role="status">
                {stage.blockedReason}
              </Notice>
            </div>
          )}
        </Block>
      )}

      {/* Куратор сдал этап: записка, черновик итога и возврат с причиной
          (требование Э-05, решение Р-325; сторона менеджера — М-25). */}
      {mayHandBack && stage.handedOverAt !== null ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            {`Куратор сдал этап ${formatDay(stage.handedOverAt)}`}
          </Heading>
          {(stage.handoverNote ?? '').trim() === '' ? null : (
            <Text size={15} style={{ whiteSpace: 'pre-wrap', marginBottom: 8 }}>
              {stage.handoverNote}
            </Text>
          )}
          <Text muted size={13} style={{ marginBottom: 12 }}>
            Записка подставлена черновиком «Итога этапа» в форму перевода на согласование. Для клиента
            этап остаётся «В работе».
          </Text>
          <Disclosure title="Вернуть куратору">
            <Form action={handBackStageAction}>
              <input type="hidden" name="stageId" value={stage.id} />
              <Field
                label="Причина возврата"
                name="reason"
                scope="handback"
                multiline
                required
                defaultValue={draft.handback ?? ''}
                hint="Куратор получит её письмом и увидит на экране этапа."
              />
              <FormActions>
                <Button tone="quiet">Вернуть куратору</Button>
              </FormActions>
            </Form>
          </Disclosure>
        </Card>
      ) : null}

      {nextUnpaid ? (
        <Block as="div" style={{ marginBottom: 24 }}>
          <Notice tone="quiet" role="status">
            Следующий этап не оплачен: его транш ещё не поступил. Перевести этап можно — подсказка только напоминает
            об оплате.
          </Notice>
        </Block>
      ) : null}

      {!live && can(actor, 'STAGE_SET_STATE', ref) ? (
        <Block as="div" style={{ marginBottom: 24 }}>
          <Notice tone="quiet" role="status">
            {`Работа ${PROJECT_STATUS_LABEL[
              stage.project.status as ProjectStatusKey
            ].toLowerCase()}: этапы не меняются. Вернуть работу в действие можно на её экране, в разделе «Управление работой».`}
            {approvalLine === null ? null : (
              <span style={{ display: 'block', marginTop: 6 }}>{approvalLine}.</span>
            )}
          </Notice>
        </Block>
      ) : null}

      {/* Клиенту у приостановленной работы — почему на этапе нет кнопок и
          срока: этапы стоят (Р-240), от него ничего не ждут, как на
          карточке работы (Р-329); срок согласования на паузе хранит
          остаток дней (Р-290), и об остановленном сроке говорится, только
          если срок был (решение Р-654). */}
      {!live && actor.role === 'CLIENT' && stage.project.status === 'PAUSED' ? (
        <Block as="div" style={{ marginBottom: 24 }}>
          <Notice tone="quiet" role="status">
            {state !== 'IN_APPROVAL'
              ? 'Работа приостановлена — сейчас от вас ничего не требуется.'
              : stage.approvalDaysLeft === null
                ? 'Работа приостановлена — сейчас от вас ничего не требуется. Согласовать этап можно будет, когда работа продолжится.'
                : 'Работа приостановлена — сейчас от вас ничего не требуется. Согласовать этап можно будет, когда работа продолжится: срок согласования на это время остановлен.'}
          </Notice>
        </Block>
      ) : null}

      {/* Менеджер приходит сюда с вопросом «что тут делать», а экран
          начинался с механики перевода состояний. Теперь сверху — ответ:
          чей ход, на сколько просрочено, что предпринять и чем управлять
          (решение Р-199). */}
      {forStaff ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Что сделать сейчас
          </Heading>
          {/* Подсказка — по сдаче, возврату, материалу, версиям на
              публикации и просрочке (решение Р-723). */}
          <Text style={{ marginBottom: 12 }}>
            {todo.text}
            {/* «Напишите в переписке» — ссылкой с заготовкой (УМ-09, Р-377). */}
            {todo.draft !== null ? (
              <>
                {' '}
                <a
                  className="cab-mark"
                  href={`/cabinet/projects/${stage.project.code}/messages?draft=${state === 'AWAITING_CLIENT' ? 'remind' : 'approve'}#body`}
                >
                  {state === 'AWAITING_CLIENT' ? 'Напомнить о материалах' : 'Напомнить о согласовании'}
                </a>
              </>
            ) : null}
          </Text>
          {approvalLine === null ? null : (
            <Text size={14} style={{ marginBottom: 12, fontWeight: 600 }}>
              {approvalLine}.
            </Text>
          )}
          {waited.until === null ? null : (
            <Text size={14} style={{ marginBottom: 12 }}>
              {`Этап ждал материалов клиента ${waited.days} ${plural(waited.days, 'день', 'дня', 'дней')}. По п. 8.2 оферты срок этапа можно перенести на столько же — до ${formatDate(waited.until)}: «Перенести срок этапа» ниже.`}
            </Text>
          )}
          <div
            style={{
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              fontFamily: SANS,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--pd-ink-muted)',
              marginBottom: 14,
            }}
          >
            {/* Та же подпись хода, что на шкале и на сводке (решение Р-288);
                куратор читает её со своей стороны (Э-04, Р-329). */}
            <span>
              {turnLabel(
                state,
                curatorView
                  ? 'expert'
                  : actor.role === 'HEAD' && stage.project.managerId !== actor.id
                    ? 'foreign-head'
                    : 'curator',
                stage.project.expertId !== null,
                stage.handedOverAt,
              )}
            </span>
            {late === null ? null : (
              <span style={{ color: 'var(--pd-ink)', fontWeight: 600 }}>
                просрочено {late} {plural(late, 'день', 'дня', 'дней')}
              </span>
            )}
            <span>
              {stage.materials.length}{' '}
              {plural(stage.materials.length, 'материал', 'материала', 'материалов')}
            </span>
            {pendingComments === 0 ? null : (
              <span>
                {pendingComments} {plural(pendingComments, 'замечание', 'замечания', 'замечаний')} на
                модерации
              </span>
            )}
            {/* Версия на публикации стоит ниже формы перевода: ссылка ведёт к
                ней на этом же экране (решение Р-723). */}
            {pendingVersions.length === 0 ? null : (
              <a href={`#version-${pendingVersions[0].id}`} style={FACT_LINK}>
                {pendingVersionsLine(pendingVersions.length)}
              </a>
            )}
          </div>

          {/* Срок переносится здесь же: менеджер держит сроки, и уходить
              за этим на экран работы незачем. */}
          <Disclosure title="Перенести срок этапа">
            <Form action={moveStageDue}>
              <input type="hidden" name="stageId" value={stage.id} />
              <Field
                label="Новый срок"
                name="dueOn"
                scope="due"
                type="date"
                required
                defaultValue={draft.dueOn ?? stage.dueOn?.toISOString().slice(0, 10) ?? ''}
              />
              {/* Перенос — с причиной: клиент получает её письмом, эксперт
                  этапа в работе — тоже (требование М-15, решение Р-302). */}
              <Field
                label="Причина переноса"
                name="reason"
                scope="due"
                multiline
                required
                defaultValue={draft.dueReason ?? ''}
                hint="Клиент получит её письмом; без причины перенос читается как срыв."
              />
              <FormActions>
                <Button tone="quiet">Сохранить срок</Button>
              </FormActions>
            </Form>
          </Disclosure>
          {/* Завершённый этап возвращается в работу с причиной; перед этим —
              сколько по работе актов и оплаченных траншей (требование М-11,
              ОМ-21, решение Р-303). */}
          {state === 'DONE' && paperwork !== null ? (
            <Disclosure title="Вернуть этап в работу" style={{ marginTop: 12 }}>
              <Form action={reopenStageAction}>
                <input type="hidden" name="stageId" value={stage.id} />
                {paperwork.acts + paperwork.paid > 0 ? (
                  <Notice tone="quiet" role="status">
                    {`По работе актов — ${paperwork.acts}, оплачено траншей — ${paperwork.paid}: проверьте, не закрывают ли они этот этап.`}
                  </Notice>
                ) : null}
                <Field
                  label="Причина возврата"
                  name="reason"
                  scope="reopen"
                  multiline
                  required
                  defaultValue={draft.reopenReason ?? ''}
                  hint="Клиент и руководитель получат её письмом. Приёмка этапа остаётся в истории, новая сдача даст новый срок согласования."
                />
                <Field label="Новый срок этапа" name="dueOn" scope="reopen" type="date" hint="Необязательно." />
                <FormActions>
                  <Button tone="quiet">Вернуть в работу</Button>
                </FormActions>
              </Form>
            </Disclosure>
          ) : null}
          {/* Итог правится, не снимая этап с согласования (решение Р-289). */}
          {state === 'IN_APPROVAL' ? (
            <Disclosure title="Поправить итог этапа" style={{ marginTop: 12 }}>
              <Form action={saveStageOutcome}>
                <input type="hidden" name="stageId" value={stage.id} />
                <Field
                  label="Итог этапа: что сделано и что дальше"
                  name="outcome"
                  multiline
                  required
                  defaultValue={draft.outcome ?? stage.outcome ?? ''}
                  hint="Итог клиент читает над кнопками согласования."
                />
                <FormActions>
                  <Button tone="quiet">Сохранить итог</Button>
                </FormActions>
              </Form>
            </Disclosure>
          ) : null}
        </Card>
      ) : null}

      {/* Практике — своя карточка: согласует клиент, а за него — только с
          основанием, которое клиент увидит (требование М-12, Р-292). */}
      {mayApprove && actor.role !== 'CLIENT' ? (
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            {`Этап ждёт согласования клиента${
              stage.approvalDueOn === null ? '' : ` · до ${formatDay(stage.approvalDueOn)}`
            }`}
          </Heading>
          <Text style={{ marginBottom: 16 }}>
            Согласует этап клиент. Согласовать за него можно, только если он подтвердил согласие вне
            кабинета — письмом, в мессенджере или по телефону. Основание клиент увидит в истории
            работы и в письме.
          </Text>
          <Disclosure title="Согласовать за клиента">
            <Form action={approveForClient}>
              <input type="hidden" name="stageId" value={stage.id} />
              <Field
                label="Основание"
                name="basis"
                scope="for-client"
                required
                placeholder="Клиент подтвердил письмом 02.10"
                defaultValue={draft.basis ?? ''}
                hint="Клиент прочитает: «Этап согласован менеджером по вашему подтверждению: …»."
              />
              <FormActions>
                <Button tone="quiet">Согласовать за клиента</Button>
              </FormActions>
            </Form>
          </Disclosure>
        </Card>
      ) : null}

      {mayApprove && actor.role === 'CLIENT' ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Этап ждёт вашего согласования
          </Heading>
          {/* Итог — над кнопками: клиент решает о согласовании, зная, что
              сделано и что дальше (требование Т-14, решение Р-289). */}
          {(stage.outcome ?? '').trim() === '' ? null : (
            <>
              <Text muted size={13} style={{ marginBottom: 4 }}>
                Итог этапа: что сделано и что дальше
              </Text>
              <Text size={15} style={{ whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                {stage.outcome}
              </Text>
            </>
          )}
          <Text style={{ marginBottom: 16 }}>
            Посмотрите последнюю версию материалов и комментарии. После согласования этап
            закрывается, и работа переходит к следующему.
            {mayReturn ? ' Если что-то нужно исправить, верните этап с замечаниями.' : ''}
          </Text>
          {/* Срок согласования — по оферте: п. 7.2 всегда, п. 7.3 — когда
              автозакрытие включено (требование Т-15, решение Р-290). */}
          {stage.approvalDueOn === null ? null : (
            <Text style={{ marginBottom: 16, fontWeight: 600 }}>
              {`Согласовать до ${formatDay(stage.approvalDueOn)} включительно (по московскому времени).`}
              {autoAcceptEnabled() ? (
                <>
                  {' Если до этой даты вы не согласуете этап и не вернёте его с замечаниями, он считается принятым — '}
                  <a href="/offer#delivery" style={OFFER_LINK}>
                    п. 7.3 оферты
                  </a>
                  .
                </>
              ) : (
                <>
                  {' Срок — по '}
                  <a href="/offer#delivery" style={OFFER_LINK}>
                    п. 7.2 оферты
                  </a>
                  .
                </>
              )}
            </Text>
          )}
          <Form action={approveStage} inline>
            <input type="hidden" name="stageId" value={stage.id} />
            <Button>Согласовать этап</Button>
          </Form>
          {/* Второе действие — нейтральное и под раскрытием: акцент на
              экране один, а форма замечаний нужна не каждому
              (решения Р-165, Р-178, Р-281). */}
          {mayReturn ? (
            <Disclosure
              title="Вернуть с замечаниями"
              id="return"
              open={failure?.slot === 'return'}
              style={{ marginTop: 16 }}
            >
              <Form action={returnStageWithRemarks}>
                <input type="hidden" name="stageId" value={stage.id} />
                <ActionError id={errorId} slot="return" />
                <Field
                  label="Что исправить или дополнить"
                  name="remarks"
                  scope="return"
                  multiline
                  required
                  maxLength={RETURN_TEXT_MAX}
                  defaultValue={draft.remarks ?? ''}
                  hint={`Замечания увидит менеджер; этап вернётся в работу. ${TEXT_LIMIT}`}
                />
                <FormActions>
                  <Button tone="quiet">Вернуть с замечаниями</Button>
                </FormActions>
              </Form>
            </Disclosure>
          ) : null}
        </Card>
      ) : null}

      {mayEdit && stageStateButtons(state).length > 0 ? (
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Перевести этап
          </Heading>
          {/* Переход без поля — это одна кнопка, и такие переходы стоят
              рядом: столбиком они читались как разные дела. Остановка
              требует причины, которую читает клиент, и потому набирается
              полной формой над ними (решение Р-170). */}
          {stageStateButtons(state)
            .filter((next) => next === 'AWAITING_CLIENT')
            .map((next) => (
              <Form key={next} action={changeStageState} style={{ marginBottom: 16 }}>
                <input type="hidden" name="stageId" value={stage.id} />
                <input type="hidden" name="state" value={next} />
                <Field
                  label="Причина остановки"
                  name="reason"
                  required
                  placeholder="Ждём протокол испытаний; после загрузки — два рабочих дня на расчёт"
                  hint="Причину читает клиент: от неё зависит, что и когда он пришлёт."
                />
                <FormActions>
                  <Button tone="quiet">Перевести в «{stageLabel(next, true)}»</Button>
                </FormActions>
              </Form>
            ))}
          {/* На согласование — с итогом: его клиент читает над кнопками и
              в письме (требование Т-14, решение Р-289). Подставляется
              прежний итог: после возврата его достаточно поправить. */}
          {stageStateButtons(state)
            .filter((next) => next === 'IN_APPROVAL' && stage.materials.length > 0)
            .map((next) => (
              <Form key={next} action={changeStageState} style={{ marginBottom: 16 }}>
                <input type="hidden" name="stageId" value={stage.id} />
                <input type="hidden" name="state" value={next} />
                <Field
                  label="Итог этапа: что сделано и что дальше"
                  name="reason"
                  scope="submit"
                  multiline
                  required
                  defaultValue={draft.outcome ?? stage.outcome ?? stage.handoverNote ?? ''}
                  hint="Итог клиент читает над кнопками согласования и в письме."
                />
                <FormActions>
                  <Button tone="quiet">Перевести в «{stageLabel(next, true)}»</Button>
                </FormActions>
              </Form>
            ))}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {/* На согласование — только с материалом: пустой этап клиенту
                нечего посмотреть, и перевод отказал бы (решение Р-254). */}
            {stageStateButtons(state)
              .filter((next) => next !== 'AWAITING_CLIENT' && next !== 'IN_APPROVAL')
              .map((next) => (
                <Form key={next} action={changeStageState} inline>
                  <input type="hidden" name="stageId" value={stage.id} />
                  <input type="hidden" name="state" value={next} />
                  <Button tone="quiet">Перевести в «{stageLabel(next, true)}»</Button>
                </Form>
              ))}
          </div>
          {stageStateButtons(state).includes('IN_APPROVAL') && stage.materials.length === 0 ? (
            <Text muted size={13} style={{ marginTop: 12 }}>
              На согласование клиенту этап уходит, когда к нему приложен материал.
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Block>
        <Heading level={2} style={{ marginBottom: 12 }}>Материалы и версии</Heading>
        {stage.materials.length === 0 ? (
          <Text muted>
            {/* Куратору «приложите первый» — только когда ход за ним
                (решение Р-723). */}
            {mayUpload && !(curatorView && curatorLine.idle)
              ? 'Материалов по этапу пока нет — приложите первый.'
              : 'Материалов по этапу пока нет.'}
          </Text>
        ) : (
          <div style={{ display: 'grid', gap: 20, marginTop: 12 }}>
            {stage.materials.map((material) => (
              <Card key={material.id}>
                <Heading level={3} style={{ marginBottom: 12 }}>
                  {material.title}
                </Heading>

                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
                  {material.versions.map((version, index) => (
                    <li
                      key={version.id}
                      // Якорь строки фактов «N версий ждут публикации» (Р-723).
                      id={forStaff ? `version-${version.id}` : undefined}
                      style={{
                        borderTop: '1px solid var(--pd-divider)',
                        paddingTop: 16,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Chip mono>v{version.number}</Chip>
                        <Text size={14}>
                          {authorName(version.uploadedBy, actor, version.uploadedById)} ·{' '}
                          {formatDay(version.uploadedAt)} · {formatSize(version.sizeBytes)}
                        </Text>
                        <span style={{ marginLeft: 'auto' }}>
                          <ButtonLink href={`/cabinet/files/${version.id}`}>Скачать</ButtonLink>
                        </span>
                      </div>

                      {/* Версия эксперта видна клиенту после публикации
                          куратором: клиенту её здесь нет вовсе, эксперту —
                          с пометкой, куратору — с решением (Т-18, Р-294). */}
                      {version.moderation === null ? null : version.moderation.status === 'PENDING' ? (
                        <div style={{ marginTop: 10 }}>
                          <Chip>{mayModerate ? 'ждёт публикации клиенту' : 'ждёт публикации менеджером'}</Chip>
                          {mayModerate ? (
                            <>
                              {/* ФИО куратора в файле (УК-03, Р-396). */}
                              {version.moderation.identityHint ? (
                                <Text size={13} style={{ marginTop: 8, color: 'var(--pd-ink-secondary)' }}>
                                  В имени файла или в свойствах документа (автор) — фамилия куратора: клиент её
                                  увидит. Попросите куратора убрать её или не публикуйте.
                                </Text>
                              ) : null}
                              {/* Комментарии практики к версии куратора стоят
                                  «опубликованными» с самого начала и
                                  открываются клиенту вместе с версией
                                  (решение владельца, Р-546). */}
                              <Text muted size={13} style={{ marginTop: 8 }}>
                                {(() => {
                                  const staffNotes = version.comments.filter(
                                    (comment) => comment.author.role === 'MANAGER' || comment.author.role === 'HEAD',
                                  ).length;
                                  return staffNotes === 0
                                    ? 'Вместе с версией клиент увидит комментарии менеджера к ней, если они будут.'
                                    : `Вместе с версией клиент увидит комментарии менеджера к ней: ${staffNotes}.`;
                                })()}
                              </Text>
                              <Form action={decideOnVersion} inline style={{ marginTop: 10 }}>
                                <input type="hidden" name="versionId" value={version.id} />
                                <input type="hidden" name="stageId" value={stage.id} />
                                <input type="hidden" name="decision" value="publish" />
                                <Button tone="quiet">Опубликовать клиенту</Button>
                              </Form>
                              <Disclosure title="Не публиковать" style={{ marginTop: 10 }}>
                                <Form action={decideOnVersion}>
                                  <input type="hidden" name="versionId" value={version.id} />
                                  <input type="hidden" name="stageId" value={stage.id} />
                                  <input type="hidden" name="decision" value="reject" />
                                  <Field
                                    label="Причина"
                                    name="note"
                                    scope={`version-${version.id}`}
                                    multiline
                                    required
                                    defaultValue={draft.note ?? ''}
                                    hint="Причину куратор получит письмом."
                                  />
                                  <FormActions>
                                    <Button tone="quiet">Не публиковать</Button>
                                  </FormActions>
                                </Form>
                              </Disclosure>
                            </>
                          ) : null}
                        </div>
                      ) : version.uploadedById === actor.id ? (
                        /* У своей версии куратор видит день публикации и
                           причину отказа (Э-06, Р-326). */
                        <Text muted size={14} style={{ marginTop: 10 }}>
                          {sentence(versionState(version.moderation))}
                        </Text>
                      ) : version.moderation.status === 'REJECTED' ? (
                        <Text muted size={14} style={{ marginTop: 10 }}>
                          {`Не опубликована клиенту${
                            version.moderation.note === null ? '' : `: ${version.moderation.note}`
                          }`}
                        </Text>
                      ) : null}

                      <CommentList
                        comments={version.comments}
                        actor={actor}
                        mayModerate={mayModerate}
                        stageId={stage.id}
                        decide={decideOnComment}
                      />

                      {/* Поле комментария стояло раскрытым под свежей
                          версией и занимало полтораста пикселей, хотя
                          пишут в него изредка. Раскрывается по нажатию
                          (решение Р-178). К своей отклонённой версии
                          куратор замечаний не пишет (решение Р-671). */}
                      {index === 0 && mayComment && !(curatorView && version.moderation?.status === 'REJECTED') ? (
                        <Disclosure
                          title="Оставить комментарий"
                          id={`comment-${version.id}`}
                          open={draft.commentVersion === version.id}
                          style={{ marginTop: 14 }}
                        >
                          <Form action={commentOnVersion}>
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="stageId" value={stage.id} />
                            {draft.commentVersion === version.id ? <ActionError id={errorId} slot="comment" /> : null}
                            {/* У куратора — три подсказки (Э-07 в составе
                                ответа С-1, решение Р-327): как писать
                                замечание, когда его увидит клиент и где
                                граница работы куратора. */}
                            <Field
                              label="Комментарий к текущей версии"
                              name="body"
                              scope={version.id}
                              multiline
                              required
                              maxLength={COMMENT_MAX}
                              placeholder={curatorView ? 'Раздел — что не так — как исправить' : undefined}
                              defaultValue={draft.commentVersion === version.id ? draft.comment : undefined}
                              hint={[
                                curatorView ? 'Клиент увидит замечание после проверки менеджером.'
                                // Р-546: практике — о неопубликованной версии куратора.
                                : version.moderation?.status === 'PENDING' ? 'Версия куратора ещё не опубликована. Когда её опубликуют, клиент увидит и этот комментарий с подписью «Менеджер». Замечание только для куратора напишите в причине «Не публиковать».'
                                : null,
                                // Предел длины — у каждого поля (решение Р-722).
                                TEXT_LIMIT,
                              ]
                                .filter((part) => part !== null)
                                .join(' ')}
                            />
                            {curatorView ? (
                              <Text muted size={13}>
                                Замечания объясняют, что и почему исправить; текст работы пишет автор.
                              </Text>
                            ) : null}
                            <FormActions>
                              <Button tone="quiet">Отправить</Button>
                            </FormActions>
                          </Form>
                        </Disclosure>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {mayUpload ? (
                  <Disclosure
                    title="Загрузить следующую версию"
                    id={`upload-${material.id}`}
                    open={draft.upload === material.id}
                    style={{ marginTop: 20 }}
                  >
                    <Form action={uploadMaterial} encType="multipart/form-data">
                      <input type="hidden" name="projectId" value={stage.project.id} />
                      <input type="hidden" name="stageId" value={stage.id} />
                      <input type="hidden" name="materialId" value={material.id} />
                      {draft.upload === material.id ? <ActionError id={errorId} slot="upload" /> : null}
                      <FileField
                        label="Файл следующей версии"
                        name="file"
                        scope={material.id}
                        required
                      />
                      <FormActions>
                        <Button tone="quiet">Загрузить</Button>
                      </FormActions>
                    </Form>
                  </Disclosure>
                ) : null}
              </Card>
            ))}
          </div>
        )}

        {/* Вместо форм — почему их нет и что делать (Т-17, М-10, Р-293). */}
        {refusal !== null && can(actor, 'MATERIAL_UPLOAD', ref) ? (
          <Text muted size={14} style={{ marginTop: 16 }}>
            {refusal}.
          </Text>
        ) : null}

        {mayUpload ? (
          <Disclosure
            title="Приложить новый материал"
            id="upload-new"
            open={draft.upload === 'new'}
            style={{ marginTop: 20 }}
          >
            <Form action={uploadMaterial} encType="multipart/form-data">
              <input type="hidden" name="projectId" value={stage.project.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              {draft.upload === 'new' ? <ActionError id={errorId} slot="upload" /> : null}
              <Field
                label="Название"
                name="title"
                maxLength={300}
                scope="new-material"
                placeholder="Протокол испытаний"
                defaultValue={draft.upload === 'new' ? draft.title : undefined}
              />
              <FileField
                label="Файл"
                name="file"
                scope="new-material"
                required
                hint="Каждая загрузка сохраняется отдельной версией: прежние остаются доступными."
              />
              <FormActions>
                <Button tone="quiet">Загрузить</Button>
              </FormActions>
            </Form>
          </Disclosure>
        ) : null}
      </Block>
    </Shell>
  );
}
