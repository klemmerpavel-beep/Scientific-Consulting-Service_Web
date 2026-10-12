import { notFound } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  FileField,
  Form,
  FormActions,
  Heading,
  ScreenHead,
  Text,
} from '../../../../../components/cabinet/ui';
import { DOWNLOAD_HREF } from '../../../../../lib/cabinet/downloads';
import { PREPARE_MEMO } from '../../../../../lib/cabinet/memos';
import { prepareView } from '../../../../../lib/cabinet/prepare';
import { requireActor } from '../../../../../lib/cabinet/session';
import { addMaterialVersion } from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * «Что подготовить» (улучшение У-2, решение Р-563): материалы для старта
 * по виду сопровождения. Клиент прикладывает файл у пункта — материал
 * ложится под названием пункта, и пункт отмечается «приложено». Сотрудник
 * видит те же отметки.
 */
export default async function PrepareScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const actor = await requireActor(`/cabinet/projects/${code}/prepare`);
  const data = await prepareView(actor, decodeURIComponent(code));
  if (data === null) notFound();
  const { project, rows, done, total, open, mayAttach, serviceName } = data;
  const base = `/cabinet/projects/${encodeURIComponent(project.code)}`;
  const forClient = actor.role === 'CLIENT';

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={base}
        backLabel={project.title}
        title="Что подготовить"
        note={
          rows.length === 0
            ? 'Для этого вида сопровождения перечня нет: что нужно для старта, менеджер напишет в переписке.'
            : forClient
              ? `${serviceName}: что прислать, чтобы работа началась без переспросов. Приложите файл у пункта — он ляжет в материалы работы под названием пункта. Чего нет, напишите менеджеру в переписке.`
              : `${serviceName}: что клиент присылает к старту. Пункт отмечен, когда у работы есть материал с его названием.`
        }
        action={
          <ButtonLink href={`${DOWNLOAD_HREF}/${PREPARE_MEMO.key}`} download>
            Скачать .docx
          </ButtonLink>
        }
      />
      <ActionError id={(await searchParams).error} />

      {rows.length === 0 ? null : (
        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 4 }}>
            {forClient ? `Приложено ${done} из ${total}` : `Клиент приложил ${done} из ${total}`}
          </Heading>
          {open ? null : (
            <Text muted size={14} style={{ marginBottom: 8 }}>
              Первый этап согласован: исходные материалы уже в работе. Новые файлы прикладываются в «Материалах».
            </Text>
          )}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
            {rows.map((row) => (
              <li key={row.key} style={{ display: 'grid', gap: 8, paddingTop: 12, borderTop: '1px solid var(--pd-divider)' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 2 }}>
                    <Heading level={3} size={3}>
                      {row.title}
                    </Heading>
                    {row.attached ? <Chip>приложено</Chip> : null}
                  </div>
                  <Text muted size={13} style={{ margin: 0 }}>
                    {row.note}
                  </Text>
                </div>
                {mayAttach ? (
                  <Form action={addMaterialVersion}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="title" value={row.title} />
                    {row.materialId === null ? null : <input type="hidden" name="materialId" value={row.materialId} />}
                    <input type="hidden" name="back" value={`${base}/prepare`} />
                    <FileField label={`Файл: ${row.title}`} name="file" required scope={row.key} labelHidden />
                    <FormActions>
                      <Button tone="quiet">{row.attached ? 'Приложить новую версию' : 'Приложить'}</Button>
                    </FormActions>
                  </Form>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Shell>
  );
}
