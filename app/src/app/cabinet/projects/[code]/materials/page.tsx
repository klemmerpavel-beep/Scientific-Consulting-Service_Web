import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  FileField,
  Form,
  FormActions,
  FormRow,
  Heading,
  ScreenHead,
  Select,
  Text,
  authorName,
  formatDate,
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
      <ScreenHead
        backHref={`/cabinet/projects/${project.code}`}
        backLabel={project.title}
        title="Материалы работы"
        note={project.title}
      />

      {project.materials.length === 0 ? (
        <Empty title="Материалов пока нет" />
      ) : (
        <ul className="cab-block" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
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
                  <Form
                    action={addMaterialVersion}
                    style={{
                      marginTop: 16,
                      paddingTop: 16,
                      borderTop: '1px solid var(--pd-divider)',
                    }}
                  >
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="materialId" value={material.id} />
                    <input type="hidden" name="back" value={`/cabinet/projects/${project.code}/materials`} />
                    <FileField
                      label={`Новая версия материала «${material.title}»`}
                      name={`file-${material.id}`}
                      required
                    />
                    <FormActions>
                      <Button tone="quiet">Загрузить следующую версию</Button>
                    </FormActions>
                  </Form>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {mayUpload ? (
        <Card style={{ marginTop: 28 }}>
          <Heading level={2} style={{ marginBottom: 16 }}>Приложить материал</Heading>
          <Form action={addMaterialVersion}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="back" value={`/cabinet/projects/${project.code}/materials`} />
            <FormRow>
              <Field label="Название" name="title" placeholder="Черновик главы 2" />
              <Select label="Этап" name="stageId" defaultValue="">
                <option value="">без привязки к этапу</option>
                {project.stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.position}. {stage.title}
                  </option>
                ))}
              </Select>
              <FileField label="Файл" name="file" required />
            </FormRow>
            <FormActions>
              <Button>Приложить</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}
    </Shell>
  );
}
