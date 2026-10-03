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
  authorName,
  formatSize,
  plural,
  type StageStateKey,
  turnLabel,
} from '../../../../components/cabinet/ui';
import { SANS } from '../../../../components/cabinet/tokens';
import { can, presentReturnText } from '../../../../lib/cabinet/access';
import { autoAcceptEnabled, formatDay } from '../../../../lib/cabinet/approval';
import { approvalStaffLine } from '../../../../lib/cabinet/approval-text';
import { formDraft } from '../../../../lib/cabinet/flash';
import { stageById } from '../../../../lib/cabinet/queries';
import { daysPast } from '../../../../lib/cabinet/clock';
import ActionError from '../../../../components/cabinet/ActionError';
import CommentList from '../../../../components/cabinet/CommentList';
import { stageStateButtons } from '../../../../lib/cabinet/stage-state';
import {
  PROJECT_STATUS_LABEL,
  type ProjectStatusKey,
} from '../../../../lib/cabinet/project-status';
import { currentActor } from '../../../../lib/cabinet/session';
import {
  acknowledgeStageReturn,
  approveStage,
  changeStageState,
  returnStageWithRemarks,
  saveStageOutcome,
  commentOnVersion,
  decideOnComment,
  moveStageDue,
  uploadMaterial,
} from '../../actions';

export const dynamic = 'force-dynamic';

/** Переходы, которые менеджер может выполнить с этого состояния. */

/** Что делать куратору в этом состоянии этапа. */
const STAFF_TODO: Record<StageStateKey, string> = {
  NOT_STARTED:
    'Этап не начат: назначьте исполнителя на работе и переведите этап в работу, когда он приступил.',
  IN_PROGRESS:
    'Работа идёт. Следите за сроком: если исполнитель не успевает, перенесите срок сейчас, а не в день сдачи.',
  AWAITING_CLIENT:
    'Ждём материалы от клиента. Если молчит дольше недели — напишите в переписке: причина остановки ему видна, но напоминание работает лучше.',
  IN_APPROVAL:
    'Клиент смотрит материалы. Замечания эксперта на модерации опубликуйте: до этого клиент их не видит.',
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

export default async function StageScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

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
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref) && (state !== 'DONE' || actor.role !== 'CLIENT');
  const staff = actor.role !== 'CLIENT';
  const mayModerate = can(actor, 'COMMENT_MODERATE', ref);
  const forStaff = actor.role !== 'CLIENT' && mayEdit;
  const late = overdueDays(stage.dueOn);
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
        note={
          stage.expert === null || actor.role === 'CLIENT'
            ? null
            : `исполнитель ${stage.expert.fullName}`
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
      {(stage.summary ?? '').trim() === '' && stage.blockedReason === null && lastReturn === undefined ? null : (
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
              <input type="hidden" name="title" value={stage.title} />
              <input type="hidden" name="summary" value={stage.summary ?? ''} />
              <Field
                label="Новый срок"
                name="dueOn"
                type="date"
                defaultValue={stage.dueOn?.toISOString().slice(0, 10) ?? ''}
                hint="Срок видит клиент: перенос без причины в переписке он читает как срыв."
              />
              <FormActions>
                <Button tone="quiet">Сохранить срок</Button>
              </FormActions>
            </Form>
          </Disclosure>
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

      {mayApprove ? (
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
                  hint="Замечания увидит куратор; этап вернётся в работу."
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
                  defaultValue={draft.outcome ?? stage.outcome ?? ''}
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
                      {index === 0 ? (
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
