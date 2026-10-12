import { notFound } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Empty,
  Form,
  FormActions,
  Heading,
  Notice,
  Outcome,
  ScreenHead,
  formatDay,
} from '../../../../../components/cabinet/ui';
import { workChecklist } from '../../../../../lib/cabinet/checklist-marks';
import { SERVICE_PHASES } from '../../../../../lib/cabinet/service-checklists';
import { requireActor } from '../../../../../lib/cabinet/session';
import { saveWorkChecklist } from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * Чек-лист вида работы по работе (задание владельца 12.10.2026, решение
 * Р-551). Отметки сохраняются: их видят менеджер работы, куратор и
 * руководитель. Отдельный экран, а не свёртка на карточке: у карточки
 * менеджера пять блоков, и шестой нарушил бы предел (Р-183).
 */
export default async function WorkChecklistScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { code } = await params;
  const actor = await requireActor(`/cabinet/projects/${code}/checklist`);
  const data = await workChecklist(actor, decodeURIComponent(code));
  if (data === null) notFound();
  const { project, list, marks, progress, closed } = data;
  const flags = await searchParams;
  const back = `/cabinet/projects/${project.code}`;

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={back}
        backLabel={project.title}
        title={list === null ? 'Чек-лист работы' : `Чек-лист: ${project.serviceType.name}`}
        // Процессные чек-листы по этой работе — с автоотметками (Р-552).
        action={
          <ButtonLink href={`/cabinet/manage/checklists?work=${encodeURIComponent(project.code)}`}>
            Порядок дел по работе
          </ButtonLink>
        }
        note={
          progress === null
            ? null
            : `Отмечено ${progress.done} из ${progress.total}. Отметки сохраняются у работы: их видят менеджер, куратор и руководитель.`
        }
      />
      <ActionError id={flags.error} />
      {flags.saved === undefined ? null : <Outcome>Отметки сохранены.</Outcome>}

      {list === null ? (
        <Empty title="Для этого вида работы чек-листа нет">
          Чек-листы заведены для шести видов сопровождения справочника.
        </Empty>
      ) : (
        <Card>
          {closed ? (
            <Notice tone="quiet" role="status">
              Работа закрыта: отметки показаны как есть и не меняются.
            </Notice>
          ) : null}
          <Form action={saveWorkChecklist}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            <input type="hidden" name="checklistKey" value={list.key} />
            {/* Что было отмечено при показе: сохраняется только разница
                (решение Р-551). */}
            <input type="hidden" name="shown" value={[...marks.keys()].join(',')} />
            {SERVICE_PHASES.map((phase) => {
              const steps = list.steps.filter((step) => step.phase === phase.key);
              return steps.length === 0 ? null : (
                <div key={phase.key} style={{ marginBottom: 12 }}>
                  <Heading level={2} size={3} style={{ marginBottom: 4 }}>
                    {phase.title}
                  </Heading>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
                    {steps.map((step) => {
                      const mark = marks.get(step.key);
                      return (
                        <li key={step.key}>
                          <Checkbox
                            name="step"
                            value={step.key}
                            defaultChecked={mark !== undefined}
                            disabled={closed}
                            label={
                              mark === undefined ? (
                                step.text
                              ) : (
                                <>
                                  {step.text}
                                  <span style={{ display: 'block', fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                                    {mark.by === null ? `Отмечено ${formatDay(mark.doneAt)}` : `Отмечено: ${mark.by}, ${formatDay(mark.doneAt)}`}
                                  </span>
                                </>
                              )
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {closed ? null : (
              <FormActions>
                <Button>Сохранить отметки</Button>
              </FormActions>
            )}
          </Form>
        </Card>
      )}
    </Shell>
  );
}
