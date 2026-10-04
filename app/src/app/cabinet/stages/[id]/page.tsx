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
  ScreenHead,
  stageLabel,
  Text,
  formatDate,
  versionState,
  authorName,
  formatSize,
  plural,
  type StageStateKey,
  turnLabel,
} from '../../../../components/cabinet/ui';
import { SANS } from '../../../../components/cabinet/tokens';
import {
  can,
  contributionRefusal,
  presentReturnText,
  staffExpertLine,
} from '../../../../lib/cabinet/access';
import { autoAcceptEnabled, formatDay } from '../../../../lib/cabinet/approval';
import { approvalStaffLine } from '../../../../lib/cabinet/approval-text';
import { formDraft } from '../../../../lib/cabinet/flash';
import { stagePaperwork } from '../../../../lib/cabinet/projects';
import { stageById } from '../../../../lib/cabinet/queries';
import { daysPast } from '../../../../lib/cabinet/clock';
import ActionError from '../../../../components/cabinet/ActionError';
import CommentList from '../../../../components/cabinet/CommentList';
import { handoverOf, stageStateButtons } from '../../../../lib/cabinet/stage-state';
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

export const dynamic = 'force-dynamic';

/** Переходы, которые менеджер может выполнить с этого состояния. */

/** Что делать куратору в этом состоянии этапа. */
const STAFF_TODO: Record<StageStateKey, string> = {
  NOT_STARTED:
    'Этап не начат: назначьте куратора на работе и переведите этап в работу, когда он приступил.',
  IN_PROGRESS:
    'Работа идёт. Следите за сроком: если куратор не успевает, перенесите срок сейчас, а не в день сдачи.',
  AWAITING_CLIENT:
    'Ждём материалы от клиента. Если молчит дольше недели — напишите в переписке: причина остановки ему видна, но напоминание работает лучше.',
  IN_APPROVAL:
    'Клиент смотрит материалы. Замечания куратора на модерации опубликуйте: до этого клиент их не видит.',
  DONE: 'Этап закрыт. Проверьте, что следующий начат и у него есть срок.',
};

/**
 * Подсказка согласования без замечаний на модерации. Прежде «опубликуйте
 * замечания» стояло на этапе всегда, и после публикации куратор искал на
 * экране то, чего уже нет (решение Р-254).
 */
const IN_APPROVAL_CLEAR =
  'Клиент смотрит материалы. Если он молчит дольше недели — напомните в переписке; согласовать этап за него можно кнопкой ниже.';

/**
 * Сколько дней прошло с назначенного срока; до срока — ничего. День
 * берётся у часов кабинета, а не у системных: снимок не должен
 * зависеть от дня съёмки (решение Р-205).
 */
const overdueDays = (dueOn: Date | null): number | null => daysPast(dueOn);


// Ссылка на оферту — строчная, как в форме заявки: подпись переносится как
// текст, а цель нажатия добирается до 44 пикселей отступом (Р-253).
const OFFER_LINK = {
  color: 'var(--pd-accent)',
  padding: '14px 0',
} as const;

/** Подпись состояния стоит отдельной строкой — с прописной буквы. */
function sentence(text: string | null): string {
  return text === null ? '' : text.charAt(0).toUpperCase() + text.slice(1);
}

export default async function StageScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
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
  // (решения Р-279, Р-289).
  const draft = (await formDraft((await searchParams).error)) ?? {};
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
  // Сдача этапа куратором менеджеру — пометка без нового состояния
  // (требование Э-05, решение Р-325).
  const handover = handoverOf(stage);
  const curatorView = actor.role === 'EXPERT';
  const mayHandOver = state === 'IN_PROGRESS' && refusal === null && can(actor, 'STAGE_HAND_OVER', ref);
  const mayHandBack = handover === 'handed' && can(actor, 'STAGE_HAND_BACK', ref);
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

      <ActionError id={(await searchParams).error} />

      {/* Описание этапа, замечания клиента и причина остановки — одним
          блоком: на экране куратора и без них до четырёх блоков (решения
          Р-183, Р-281). Описание целиком: клиент решает о согласовании,
          зная, что входило в этап (Р-190, Р-286). */}
      {/* Куратору — один блок «Что сделать сейчас»: задание, срок, причина
          возврата, последние материалы клиента и сдача этапа менеджеру
          (требование Э-05, решение Р-325). */}
      {curatorView ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Что сделать сейчас
          </Heading>
          <Text muted size={13} style={{ marginBottom: 4 }}>
            Задание
          </Text>
          <Text size={15} style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>
            {(stage.summary ?? '').trim() === '' ? 'Менеджер не описал этап.' : stage.summary}
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
                {`Клиент вернул этап с замечаниями ${formatDate(lastReturn.createdAt)}`}
                {returnText === null ? null : (
                  <span style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>{returnText}</span>
                )}
              </Notice>
            </div>
          )}
          {handover !== 'handed-back' || stage.handbackAt === null ? null : (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="quiet" role="status">
                {`Менеджер вернул этап ${formatDate(stage.handbackAt)}`}
                <span style={{ display: 'block', marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  {stage.handbackReason}
                </span>
              </Notice>
            </div>
          )}
          {stage.blockedReason === null ? null : (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="quiet" role="status">
                {stage.blockedReason}
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
                    {material.title} · v{version.number} · {formatDate(version.uploadedAt)}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          {handover === 'handed' && stage.handedOverAt !== null ? (
            <>
              <Notice tone="quiet" role="status">
                {`Этап сдан ${formatDate(stage.handedOverAt)}: ход за менеджером.`}
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
            </>
          ) : mayHandOver ? (
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
              {`Возвращён с замечаниями ${formatDate(lastReturn.createdAt)}`}
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
            {`Куратор сдал этап ${formatDate(stage.handedOverAt)}`}
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

      {/* Менеджер приходит сюда с вопросом «что тут делать», а экран
          начинался с механики перевода состояний. Теперь сверху — ответ:
          чей ход, на сколько просрочено, что предпринять и чем управлять
          (решение Р-199). */}
      {forStaff ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Что сделать сейчас
          </Heading>
          <Text style={{ marginBottom: 12 }}>
            {state === 'IN_APPROVAL' && pendingComments === 0 ? IN_APPROVAL_CLEAR : STAFF_TODO[state]}
          </Text>
          {approvalLine === null ? null : (
            <Text size={14} style={{ marginBottom: 12, fontWeight: 600 }}>
              {approvalLine}.
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
            {/* Та же подпись хода, что на шкале и на сводке (решение Р-288). */}
            <span>
              {turnLabel(
                state,
                actor.role === 'HEAD' && stage.project.managerId !== actor.id ? 'foreign-head' : 'curator',
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
            <Disclosure title="Вернуть с замечаниями" style={{ marginTop: 16 }}>
              <Form action={returnStageWithRemarks}>
                <input type="hidden" name="stageId" value={stage.id} />
                <Field
                  label="Что исправить или дополнить"
                  name="remarks"
                  scope="return"
                  multiline
                  required
                  defaultValue={draft.remarks ?? ''}
                  hint="Замечания увидит менеджер; этап вернётся в работу."
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
            {mayUpload
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
                          {formatDate(version.uploadedAt)} · {formatSize(version.sizeBytes)}
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
                          (решение Р-178). */}
                      {index === 0 && mayComment ? (
                        <Disclosure title="Оставить комментарий" style={{ marginTop: 14 }}>
                          <Form action={commentOnVersion}>
                            <input type="hidden" name="versionId" value={version.id} />
                            <input type="hidden" name="stageId" value={stage.id} />
                            <Field
                              label="Комментарий к текущей версии"
                              name="body"
                              scope={version.id}
                              multiline
                              required
                            />
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
                  <Disclosure title="Загрузить следующую версию" style={{ marginTop: 20 }}>
                    <Form action={uploadMaterial} encType="multipart/form-data">
                      <input type="hidden" name="projectId" value={stage.project.id} />
                      <input type="hidden" name="stageId" value={stage.id} />
                      <input type="hidden" name="materialId" value={material.id} />
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
          <Disclosure title="Приложить новый материал" style={{ marginTop: 20 }}>
            <Form action={uploadMaterial} encType="multipart/form-data">
              <input type="hidden" name="projectId" value={stage.project.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <Field
                label="Название"
                name="title"
                scope="new-material"
                placeholder="Протокол испытаний"
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
