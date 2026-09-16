import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Heading,
  Mono,
  Text,
  formatDate,
  formatSize,
  plural,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { projectMaterials } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import { addMaterialVersion } from '../../../actions';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  CLIENT: 'клиент',
  EXPERT: 'эксперт',
  MANAGER: 'менеджер',
  HEAD: 'руководитель',
};

export default async function ProjectMaterialsScreen({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const { code } = await params;
  const project = await projectMaterials(actor, decodeURIComponent(code));
  if (project === null) notFound();

  const ref = {
    id: project.id,
    clientId: project.clientId,
    managerId: project.managerId,
    expertId: project.expertId,
  };
  const mayUpload = can(actor, 'MATERIAL_UPLOAD', ref);

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <a href={`/cabinet/projects/${project.code}`} style={{ fontFamily: MONO, fontSize: 12 }}>
        {project.code}
      </a>

      <Mono style={{ display: 'block', marginTop: 16 }}>Материалы работы</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        {project.title}
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        Все материалы работы в одном перечне, включая не привязанные к этапу. Версии неизменяемы:
        новая редакция добавляется следующей версией, прежняя остаётся доступной. Договор, счета и
        акты лежат отдельно — на экране оплат, при договоре и траншах.
      </Text>

      {project.materials.length === 0 ? (
        <Empty title="Материалов пока нет">
          {mayUpload
            ? 'Первый файл можно приложить формой ниже: он появится здесь и у остальных участников работы.'
            : 'Как только эксперт или менеджер приложит первый файл, он появится здесь.'}
        </Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
          {project.materials.map((material) => (
            <li key={material.id}>
              <Card>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <Heading level={2} style={{ fontSize: 18 }}>
                    {material.title}
                  </Heading>
                  {material.stage === null ? (
                    <Chip tone="neutral">вне этапов</Chip>
                  ) : (
                    <Chip tone="accent">
                      этап {material.stage.position}: {material.stage.title}
                    </Chip>
                  )}
                  <Text muted size={13}>
                    {material.versions.length}{' '}
                    {plural(material.versions.length, 'версия', 'версии', 'версий')}
                  </Text>
                </div>

                <ul
                  style={{
                    margin: '14px 0 0',
                    padding: 0,
                    listStyle: 'none',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  {material.versions.map((version) => (
                    <li
                      key={version.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        flexWrap: 'wrap',
                        alignItems: 'baseline',
                        fontFamily: SANS,
                        fontSize: 14,
                        color: 'var(--pd-ink-secondary)',
                      }}
                    >
                      <span style={{ fontFamily: MONO, fontSize: 12 }}>v{version.number}</span>
                      <a href={`/cabinet/files/${version.id}`}>{version.originalName}</a>
                      <span>{formatSize(version.sizeBytes)}</span>
                      <span>{formatDate(version.uploadedAt)}</span>
                      <span>
                        {version.uploadedBy.fullName} ·{' '}
                        {ROLE_LABEL[version.uploadedBy.role] ?? version.uploadedBy.role}
                      </span>
                      {version.comments.length === 0 ? null : (
                        <span>
                          {version.comments.length}{' '}
                          {plural(version.comments.length, 'замечание', 'замечания', 'замечаний')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {mayUpload ? (
                  <form
                    action={addMaterialVersion}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid var(--pd-divider)',
                    }}
                  >
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="materialId" value={material.id} />
                    <input type="hidden" name="back" value={`/cabinet/projects/${project.code}/materials`} />
                    <input
                      type="file"
                      name="file"
                      required
                      aria-label={`Новая версия материала «${material.title}»`}
                      style={{ fontFamily: SANS, fontSize: 15 }}
                    />
                    <Button tone="quiet">Загрузить следующую версию</Button>
                  </form>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {mayUpload ? (
        <Card style={{ marginTop: 28 }}>
          <Heading level={2} style={{ marginBottom: 8 }}>
            Приложить новый материал
          </Heading>
          <Text muted style={{ marginBottom: 16 }}>
            Материал можно привязать к этапу — тогда он появится и на экране этапа, — либо оставить
            при работе целиком.
          </Text>
          <form
            action={addMaterialVersion}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              alignItems: 'end',
            }}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="back" value={`/cabinet/projects/${project.code}/materials`} />
            <Field label="Название" name="title" placeholder="Черновик главы 2" />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>Этап</span>
              <select
                name="stageId"
                defaultValue=""
                style={{
                  minHeight: 44,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid var(--pd-edge-neutral)',
                  fontFamily: SANS,
                  fontSize: 16,
                  background: 'var(--pd-ink-inverse)',
                  color: 'var(--pd-ink)',
                }}
              >
                <option value="">без привязки к этапу</option>
                {project.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.position}. {stage.title}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>Файл</span>
              <input type="file" name="file" required style={{ fontFamily: SANS, fontSize: 15 }} />
            </label>
            <div>
              <Button>Приложить</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </Shell>
  );
}
