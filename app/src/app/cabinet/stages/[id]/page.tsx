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
} from '../../../../components/cabinet/ui';
import { SANS } from '../../../../components/cabinet/tokens';
import { can } from '../../../../lib/cabinet/access';
import { stageById } from '../../../../lib/cabinet/queries';
import { daysPast } from '../../../../lib/cabinet/clock';
import { currentActor } from '../../../../lib/cabinet/session';
import {
  approveStage,
  changeStageState,
  commentOnVersion,
  decideOnComment,
  moveStageDue,
  uploadMaterial,
} from '../../actions';

export const dynamic = 'force-dynamic';

/** Переходы, которые менеджер может выполнить с этого состояния. */
/** Чей сейчас ход — тем же языком, что на сводке (решение Р-199). */
const TURN_BY_STATE: Partial<Record<StageStateKey, string>> = {
  NOT_STARTED: 'ход за вами: этап не начат',
  IN_PROGRESS: 'ход за исполнителем',
  AWAITING_CLIENT: 'ход за клиентом',
  IN_APPROVAL: 'ход за клиентом: ждёт согласования',
  DONE: 'этап закрыт',
};

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
 * Сколько дней прошло с назначенного срока; до срока — ничего. День
 * берётся у часов кабинета, а не у системных: снимок не должен
 * зависеть от дня съёмки (решение Р-205).
 */
const overdueDays = (dueOn: Date | null): number | null => daysPast(dueOn);

const NEXT_STATES: Record<StageStateKey, readonly StageStateKey[]> = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['AWAITING_CLIENT', 'IN_APPROVAL'],
  AWAITING_CLIENT: ['IN_PROGRESS', 'IN_APPROVAL'],
  IN_APPROVAL: ['IN_PROGRESS'],
  DONE: [],
};

export default async function StageScreen({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const { id } = await params;
  const stage = await stageById(actor, id);
  if (stage === null) notFound();

  const ref = stage.project;
  const state = stage.state as StageStateKey;
  const mayEdit = can(actor, 'STAGE_SET_STATE', ref);
  const mayApprove = state === 'IN_APPROVAL' && can(actor, 'STAGE_APPROVE', ref);
  // На закрытом этапе клиенту не предлагается приложить «первый» материал:
  // этап сдан, и новая загрузка в него ничего не сдвинет (решение Р-206).
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref) && (state !== 'DONE' || actor.role !== 'CLIENT');
  const staff = actor.role !== 'CLIENT';
  const mayModerate = can(actor, 'COMMENT_MODERATE', ref);
  const forStaff = actor.role !== 'CLIENT' && mayEdit;
  const late = overdueDays(stage.dueOn);
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

      {stage.blockedReason === null ? null : (
        <Block as="div" style={{ marginBottom: 24 }}>
          <Notice tone="quiet" role="status">
            {stage.blockedReason}
          </Notice>
        </Block>
      )}

      {/* Менеджер приходит сюда с вопросом «что тут делать», а экран
          начинался с механики перевода состояний. Теперь сверху — ответ:
          чей ход, на сколько просрочено, что предпринять и чем управлять
          (решение Р-199). */}
      {forStaff ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Что сделать сейчас
          </Heading>
          <Text style={{ marginBottom: 12 }}>{STAFF_TODO[state]}</Text>
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
            <span>{TURN_BY_STATE[state] ?? 'ход за практикой'}</span>
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
        </Card>
      ) : null}

      {mayApprove ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Этап ждёт вашего согласования
          </Heading>
          <Text style={{ marginBottom: 16 }}>
            Посмотрите последнюю версию материалов и комментарии. После согласования этап
            закрывается, и работа переходит к следующему.
          </Text>
          <Form action={approveStage} inline>
            <input type="hidden" name="stageId" value={stage.id} />
            <Button>Согласовать этап</Button>
          </Form>
        </Card>
      ) : null}

      {mayEdit && NEXT_STATES[state].length > 0 ? (
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Перевести этап
          </Heading>
          {/* Переход без поля — это одна кнопка, и такие переходы стоят
              рядом: столбиком они читались как разные дела. Остановка
              требует причины, которую читает клиент, и потому набирается
              полной формой над ними (решение Р-170). */}
          {NEXT_STATES[state]
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
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {NEXT_STATES[state]
              .filter((next) => next !== 'AWAITING_CLIENT')
              .map((next) => (
                <Form key={next} action={changeStageState} inline>
                  <input type="hidden" name="stageId" value={stage.id} />
                  <input type="hidden" name="state" value={next} />
                  <Button tone="quiet">Перевести в «{stageLabel(next, true)}»</Button>
                </Form>
              ))}
          </div>
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

                      {version.comments.length === 0 ? null : (
                        <ul
                          style={{
                            margin: '14px 0 0',
                            padding: '0 0 0 16px',
                            listStyle: 'none',
                            borderLeft: '2px solid var(--pd-art-line)',
                            display: 'grid',
                            gap: 12,
                          }}
                        >
                          {version.comments.map((comment) => (
                            <li key={comment.id}>
                              <Text size={14}>{comment.body}</Text>
                              <Text muted size={13} style={{ marginTop: 2 }}>
                                {authorName(comment.author, actor, comment.authorId)} ·{' '}
                                {formatDate(comment.createdAt)}
                                {comment.moderationStatus === 'PENDING'
                                  ? ' · ожидает публикации'
                                  : comment.moderationStatus === 'REJECTED'
                                    ? ' · отклонено куратором'
                                    : ''}
                              </Text>
                              {/* Отклонённое прежде выглядело опубликованным:
                                  эксперт не узнавал, что клиент его не
                                  видел, и почему (решение Р-226). */}
                              {comment.moderationStatus === 'REJECTED' &&
                              comment.moderationNote !== null ? (
                                <Text muted size={13} style={{ marginTop: 2 }}>
                                  Причина: {comment.moderationNote}
                                </Text>
                              ) : null}
                              {mayModerate && comment.moderationStatus === 'PENDING' ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                                  <Form action={decideOnComment} inline>
                                    <input type="hidden" name="commentId" value={comment.id} />
                                    <input type="hidden" name="stageId" value={stage.id} />
                                    <input type="hidden" name="decision" value="publish" />
                                    <Button tone="quiet">Опубликовать клиенту</Button>
                                  </Form>
                                  <Form action={decideOnComment} inline>
                                    <input type="hidden" name="commentId" value={comment.id} />
                                    <input type="hidden" name="stageId" value={stage.id} />
                                    <input type="hidden" name="decision" value="reject" />
                                    <Field
                                      label={`Причина отклонения: ${comment.body.slice(0, 40)}`}
                                      labelHidden
                                      name="note"
                                      scope={comment.id}
                                      placeholder="Причина — её увидит эксперт"
                                      minWidth={220}
                                    />
                                    <Button tone="quiet">Отклонить</Button>
                                  </Form>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}

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
