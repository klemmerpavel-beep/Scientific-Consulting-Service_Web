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
  Select,
  Text,
  formatDate,
  authorName,
  formatSize,
  plural,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { projectMaterials } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import { addMaterialVersion } from '../../../actions';

export const dynamic = 'force-dynamic';

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
      <a className="cab-mark" href={`/cabinet/projects/${project.code}`} style={{ fontFamily: MONO, fontSize: 12 }}>
        {project.code}
      </a>

      <Heading level={1} style={{ margin: '16px 0 24px' }}>
        Материалы: {project.title}
      </Heading>

      {project.materials.length === 0 ? (
        <Empty title="Материалов пока нет" />
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
                      <span>{authorName(version.uploadedBy, actor, version.uploadedById)}</span>
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
          <Heading level={2} style={{ marginBottom: 16 }}>Приложить материал</Heading>
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
            <Select label="Этап" name="stageId" defaultValue="">
              <option value="">без привязки к этапу</option>
              {project.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.position}. {stage.title}
                </option>
              ))}
            </Select>
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
