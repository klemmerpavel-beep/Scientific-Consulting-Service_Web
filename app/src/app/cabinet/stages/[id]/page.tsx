import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Mono,
  Notice,
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
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <a className="cab-mark" href={`/cabinet/projects/${stage.project.code}`} style={{ fontFamily: MONO, fontSize: 12 }}>
          {stage.project.code}
        </a>
        <Chip tone="accent">{STAGE_STATE_LABEL[state]}</Chip>
        {stage.dueOn === null ? null : <Chip>срок — {formatDate(stage.dueOn)}</Chip>}
      </div>

      <Heading level={1} style={{ margin: '16px 0 8px' }}>
        {stage.title}
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        {stage.project.title}
        {/* Состав привлечённых специалистов клиенту не показывается: для него
            работу ведёт куратор (решение Р-140). */}
        {stage.expert === null || actor.role === 'CLIENT'
          ? ''
          : ` · исполнитель ${stage.expert.fullName}`}
      </Text>

      {stage.blockedReason === null ? null : (
        <div style={{ marginBottom: 24 }}>
          <Notice tone="quiet" role="status">
            {stage.blockedReason}
          </Notice>
        </div>
      )}

      {mayApprove ? (
        <Card style={{ marginBottom: 24, borderColor: 'var(--pd-accent-edge)' }}>
          <Heading level={3} style={{ marginBottom: 8 }}>
            Этап ждёт вашего согласования
          </Heading>
          <Text style={{ marginBottom: 16 }}>
            Посмотрите последнюю версию материалов и комментарии. После согласования этап
            закрывается, и работа переходит к следующему.
          </Text>
          <form action={approveStage}>
            <input type="hidden" name="stageId" value={stage.id} />
            <Button>Согласовать этап</Button>
          </form>
        </Card>
      ) : null}

      {mayEdit && NEXT_STATES[state].length > 0 ? (
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} style={{ marginBottom: 12 }}>Состояние этапа</Heading>
          <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
            {NEXT_STATES[state].map((next) => (
              <form
                key={next}
                action={changeStageState}
                style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}
              >
                <input type="hidden" name="stageId" value={stage.id} />
                <input type="hidden" name="state" value={next} />
                {next === 'AWAITING_CLIENT' ? (
                  <div style={{ flex: '1 1 360px' }}>
                    <Field
                      label="Причина остановки"
                      name="reason"
                      required
                      placeholder="Ждём протокол испытаний; после загрузки — два рабочих дня на расчёт"
                      hint="Причину читает клиент: от неё зависит, что и когда он пришлёт."
                    />
                  </div>
                ) : null}
                <Button tone="quiet">Перевести в «{STAGE_STATE_LABEL[next]}»</Button>
              </form>
            ))}
          </div>
        </Card>
      ) : null}

      <section>
        <Heading level={2} style={{ marginBottom: 12 }}>Материалы и версии</Heading>
        {stage.materials.length === 0 ? (
          <Card style={{ marginTop: 12 }}>
            <Text muted>Материалов по этапу пока нет.</Text>
          </Card>
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
                        <a
                          href={`/cabinet/files/${version.id}`}
                          className="cab-btn cab-btn-quiet"
                          style={{
                            marginLeft: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 44,
                            padding: '0 18px',
                            borderRadius: 999,
                            border: '1px solid var(--pd-edge-neutral)',
                            fontFamily: SANS,
                            fontSize: 15,
                            color: 'var(--pd-ink-secondary)',
                          }}
                        >
                          Скачать
                        </a>
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
                                  <form action={decideOnComment}>
                                    <input type="hidden" name="commentId" value={comment.id} />
                                    <input type="hidden" name="stageId" value={stage.id} />
                                    <input type="hidden" name="decision" value="publish" />
                                    <Button tone="quiet">Опубликовать клиенту</Button>
                                  </form>
                                  <form action={decideOnComment}>
                                    <input type="hidden" name="commentId" value={comment.id} />
                                    <input type="hidden" name="stageId" value={stage.id} />
                                    <input type="hidden" name="decision" value="reject" />
                                    <Button tone="quiet">Отклонить</Button>
                                  </form>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}

                      {index === 0 ? (
                        <form
                          action={commentOnVersion}
                          style={{ display: 'grid', gap: 12, marginTop: 14 }}
                        >
                          <input type="hidden" name="versionId" value={version.id} />
                          <input type="hidden" name="stageId" value={stage.id} />
                          <Field label="Комментарий к текущей версии" name="body" multiline required />
                          <div>
                            <Button tone="quiet">Оставить комментарий</Button>
                          </div>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {mayUpload ? (
                  <form
                    action={uploadMaterial}
                    encType="multipart/form-data"
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: 20,
                      paddingTop: 16,
                      borderTop: '1px solid var(--pd-divider)',
                    }}
                  >
                    <input type="hidden" name="projectId" value={stage.project.id} />
                    <input type="hidden" name="stageId" value={stage.id} />
                    <input type="hidden" name="materialId" value={material.id} />
                    <label style={{ display: 'grid', gap: 8 }}>
                      <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>
                        Файл следующей версии
                      </span>
                      <input type="file" name="file" required />
                    </label>
                    <Button tone="quiet">Загрузить следующую версию</Button>
                  </form>
                ) : null}
              </Card>
            ))}
          </div>
        )}

        {mayUpload ? (
          <Card style={{ marginTop: 20 }}>
            <Heading level={3} style={{ marginBottom: 12 }}>
              Новый материал
            </Heading>
            <form
              action={uploadMaterial}
              encType="multipart/form-data"
              style={{ display: 'grid', gap: 16 }}
            >
              <input type="hidden" name="projectId" value={stage.project.id} />
              <input type="hidden" name="stageId" value={stage.id} />
              <Field label="Название" name="title" placeholder="Протокол испытаний" />
              <label style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>Файл</span>
                <input type="file" name="file" required />
              </label>
              <Text muted size={13}>
                Каждая загрузка сохраняется отдельной версией: прежние остаются доступными.
              </Text>
              <div>
                <Button>Загрузить</Button>
              </div>
            </form>
          </Card>
        ) : null}
      </section>
    </Shell>
  );
}
