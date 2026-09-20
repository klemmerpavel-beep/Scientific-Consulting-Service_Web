import {
  notFound,
  redirect } from 'next/navigation';  import Shell from '../../../../components/cabinet/Shell'; import { MONO } from '../../../../components/cabinet/tokens'; import {   Button,
  ButtonLink,
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
  STAGE_STATE_LABEL,
  Text,
  formatDate,
  authorName,
  formatSize,
  type StageStateKey,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { stageById } from '../../../../lib/cabinet/queries';
import { currentActor } from '../../../../lib/cabinet/session';
import {
  approveStage,
  changeStageState,
  commentOnVersion,
  decideOnComment,
  uploadMaterial,
} from '../../actions';

export const dynamic = 'force-dynamic';

/** Переходы, которые менеджер может выполнить с этого состояния. */
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
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref);
  const mayModerate = can(actor, 'COMMENT_MODERATE', ref);

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={`/cabinet/projects/${stage.project.code}`}
        backLabel={stage.project.code}
        title={stage.title}
        chips={<Chip tone="accent">{STAGE_STATE_LABEL[state]}</Chip>}
        note={
          stage.project.title +
          // Состав привлечённых специалистов клиенту не показывается: для
          // него работу ведёт куратор (решение Р-140).
          (stage.expert === null || actor.role === 'CLIENT'
            ? ''
            : ` · исполнитель ${stage.expert.fullName}`)
        }
        aside={stage.dueOn === null ? null : `срок — ${formatDate(stage.dueOn)}`}
      />

      {stage.blockedReason === null ? null : (
        <div style={{ marginBottom: 24 }}>
          <Notice tone="quiet" role="status">
            {stage.blockedReason}
          </Notice>
        </div>
      )}

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
                  <Button tone="quiet">Перевести в «{STAGE_STATE_LABEL[next]}»</Button>
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
                  <Button tone="quiet">Перевести в «{STAGE_STATE_LABEL[next]}»</Button>
                </Form>
              ))}
          </div>
        </Card>
      ) : null}

      <section>
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
                                  : ''}
                              </Text>
                              {mayModerate && comment.moderationStatus === 'PENDING' ? (
                                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
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
      </section>
    </Shell>
  );
}
