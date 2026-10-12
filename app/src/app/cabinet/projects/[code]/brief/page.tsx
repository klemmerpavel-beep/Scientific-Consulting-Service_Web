import { notFound } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Checkbox,
  FileField,
  Form,
  FormActions,
  Heading,
  Notice,
  ScreenHead,
  Select,
  Tabs,
  Text,
} from '../../../../../components/cabinet/ui';
import { previewWorkBrief } from '../../../../../lib/cabinet/brief/work-apply';
import { requireActor } from '../../../../../lib/cabinet/session';
import { applyWorkBriefAction, parseWorkBrief } from '../../../actions';

export const dynamic = 'force-dynamic';

const MODE_NOTE = {
  replace: 'заменить',
  fill: 'дополнить пустое',
  same: 'уже так',
  keep: 'в карточке клиента уже заполнено — не трогается',
} as const;

/**
 * «Обновить из документа» (задание владельца 12.10.2026, решение Р-560):
 * исходные данные на утверждение — в карточку работы. Сравнение «было —
 * станет», флажок у каждого поля, выбор варианта темы и этапа, к которому
 * приложить документ.
 */
export default async function WorkBriefScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ brief?: string; variant?: string; error?: string }>;
}) {
  const { code } = await params;
  const actor = await requireActor(`/cabinet/projects/${code}/brief`);
  const sp = await searchParams;
  const variant = sp.variant === undefined || !/^\d+$/u.test(sp.variant) ? null : Number(sp.variant);
  const data = await previewWorkBrief(actor, decodeURIComponent(code), sp.brief ?? null, variant);
  if (data === null) notFound();
  const { project, loaded, rows, stageDefault } = data;
  const base = `/cabinet/projects/${encodeURIComponent(project.code)}/brief`;
  const variants = loaded?.brief.variants ?? [];
  const needVariant = variants.length > 0 && (variant === null || variants[variant] === undefined);

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={`/cabinet/projects/${encodeURIComponent(project.code)}`}
        backLabel={project.title}
        title="Обновить из документа"
        note="Исходные данные на утверждение — тема, цель, задачи, план — переносятся в карточку работы. Отметьте, что перенести; документ ляжет на выбранный этап, и клиент утвердит его согласованием этапа."
      />
      <ActionError id={sp.error} />

      {loaded === null ? (
        <Card>
          {sp.brief === undefined ? null : (
            <Notice tone="quiet" role="status">
              Документ не найден: загрузите его снова.
            </Notice>
          )}
          <Form action={parseWorkBrief}>
            <input type="hidden" name="code" value={project.code} />
            <FileField
              label="Исходные данные работы или статьи"
              name="brief"
              accept=".docx,.xlsx"
              required
              hint="Word или Excel до 2 МБ. Шаблон — в «Управлении», вкладка «Шаблоны» чек-листов."
            />
            <FormActions>
              <Button>Разобрать</Button>
            </FormActions>
          </Form>
        </Card>
      ) : (
        <Card>
          {loaded.brief.issues.length === 0 && loaded.brief.manual.length === 0 ? null : (
            <Notice tone="quiet" role="status">
              Проверьте до утверждения:
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {[...loaded.brief.issues, ...loaded.brief.manual].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Notice>
          )}
          {variants.length === 0 ? null : (
            <>
              <Text size={14} style={{ marginTop: 12, marginBottom: 8 }}>
                В документе несколько вариантов темы. Выберите тот, который выбрал клиент:
              </Text>
              <Tabs
                label="Вариант темы"
                items={variants.map((item, index) => ({
                  href: `${base}?brief=${encodeURIComponent(sp.brief!)}&variant=${index}`,
                  label: `Вариант ${index + 1}`,
                  active: index === variant,
                }))}
              />
            </>
          )}
          {needVariant ? null : (
            <Form action={applyWorkBriefAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="code" value={project.code} />
              <input type="hidden" name="brief" value={sp.brief} />
              {variant === null ? null : <input type="hidden" name="variant" value={String(variant)} />}
              {rows.length === 0 ? (
                <Text muted size={14}>
                  Переносить в карточку нечего: темы, цели и задач в документе не найдено. Документ можно приложить к этапу.
                </Text>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
                  {rows.map((row) => (
                    <li key={row.key} style={{ borderTop: '1px solid var(--pd-divider)', paddingTop: 10 }}>
                      <Heading level={2} size={3} style={{ marginBottom: 4 }}>
                        {row.label}
                      </Heading>
                      <Text muted size={13} style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                        {`Было: ${row.before === '' ? '—' : row.before}`}
                      </Text>
                      <Text size={14} style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>
                        {`Станет: ${row.after}`}
                      </Text>
                      {row.mode === 'replace' || row.mode === 'fill' ? (
                        <Checkbox name="apply" value={row.key} defaultChecked label={`Перенести — ${MODE_NOTE[row.mode]}`} />
                      ) : (
                        <Text muted size={13}>
                          {MODE_NOTE[row.mode]}
                        </Text>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Select label="Приложить документ к этапу" name="stageId" defaultValue={stageDefault ?? ''}>
                <option value="">Без этапа — в материалы работы</option>
                {project.stages
                  .filter((stage) => stage.state !== 'DONE')
                  .map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.title}
                    </option>
                  ))}
              </Select>
              <FormActions>
                <Button>Применить и приложить</Button>
              </FormActions>
            </Form>
          )}
        </Card>
      )}
    </Shell>
  );
}
