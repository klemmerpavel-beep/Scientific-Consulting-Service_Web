import { redirect } from 'next/navigation';

import ActionError from '../../../../components/cabinet/ActionError';
import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Field,
  Form,
  FormActions,
  Heading,
  Notice,
  ScreenHead,
  Select,
  Text,
  formatDate,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import {
  ASSIGNMENT_STATUS_LABEL,
  allAssignments,
  isAssignmentOverdue,
} from '../../../../lib/cabinet/assignments';
import { daysPast, now as clockNow } from '../../../../lib/cabinet/clock';
import { formDraft } from '../../../../lib/cabinet/flash';
import { TOOLS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { curators, experts } from '../../../../lib/cabinet/queries';
import { requireActor } from '../../../../lib/cabinet/session';
import { assignmentStatusAction, createAssignmentAction } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * «Управление → Поручения» (требование РК-19, решение Р-352; В-19).
 *
 * Руководитель ставит поручение менеджеру или куратору: текст, срок, по
 * желанию — код работы. Форма принимает готовый текст и работу из адреса
 * (`?text=`, `?project=`) — так открывают поручение из рекомендации и из
 * строки должника. Ниже — все поручения: открытые сверху, просроченные
 * помечены; открытое можно отозвать.
 */
export default async function AssignmentsScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; text?: string; project?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/assignments');
  if (!can(actor, 'ASSIGNMENT_CREATE')) redirect(homeFor(actor));
  const flags = await searchParams;
  const draft = (await formDraft(flags.error)) ?? {};
  const [rows, managers, curatorList] = await Promise.all([allAssignments(actor), curators(actor), experts(actor)]);
  const people = [
    ...managers.filter((row) => row.role === 'MANAGER').map((row) => ({ id: row.id, label: `${row.fullName} — менеджер` })),
    ...curatorList.map((row) => ({ id: row.id, label: `${row.fullName} — куратор` })),
  ];
  const at = clockNow();
  const open = rows.filter((row) => row.status === 'ASSIGNED' || row.status === 'IN_PROGRESS');
  const late = open.filter((row) => isAssignmentOverdue(row, at));

  return (
    <Shell actor={actor} current={TOOLS_HREF}>
      <ScreenHead
        backHref={TOOLS_HREF}
        backLabel="Управление"
        title="Поручения"
        note={`Открыто ${open.length}, из них просрочено ${late.length}. Сотрудник видит поручение в делах первого экрана и сам отмечает «в работе» и «сделано».`}
      />
      <ActionError id={flags.error} />
      {flags.created === '1' ? (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="quiet">Поручение поставлено; сотруднику ушло уведомление.</Notice>
        </div>
      ) : null}

      <Card style={{ marginBottom: 20 }} id="new">
        <Heading level={2} size={3} style={{ marginBottom: 12 }}>
          Новое поручение
        </Heading>
        <Form action={createAssignmentAction}>
          <Select label="Кому" name="assigneeId" required defaultValue={draft.assigneeId ?? ''}>
            <option value="">Выберите сотрудника</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
          <Field
            label="Что сделать"
            name="text"
            multiline
            required
            defaultValue={draft.text ?? flags.text ?? ''}
            hint="Не длиннее 2000 знаков. Сотрудник получит текст в уведомлении."
          />
          <Field label="Срок" name="dueOn" type="date" required defaultValue={draft.dueOn ?? ''} />
          <Field
            label="Код работы, если поручение по работе"
            name="project"
            defaultValue={draft.project ?? flags.project ?? ''}
            hint="Сотрудник должен вести эту работу: менеджер — свою, куратор — назначенную."
          />
          <FormActions>
            <Button>Поставить поручение</Button>
          </FormActions>
        </Form>
      </Card>

      <Card>
        <Heading level={2} size={3} style={{ marginBottom: 12 }}>
          Все поручения
        </Heading>
        {rows.length === 0 ? (
          <Text muted>Поручений пока нет.</Text>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
            {rows.map((row) => {
              const overdue = isAssignmentOverdue(row, at);
              const days = overdue ? daysPast(row.dueOn, at) : null;
              const isOpen = row.status === 'ASSIGNED' || row.status === 'IN_PROGRESS';
              return (
                <li key={row.id} style={{ display: 'grid', gap: 6, borderBottom: '1px solid var(--pd-divider)', paddingBottom: 12 }}>
                  <Text size={15}>{row.text}</Text>
                  <Text muted size={13}>
                    {[
                      `${row.assignee.fullName}${row.assignee.role === 'EXPERT' ? ' — куратор' : ' — менеджер'}`,
                      `срок ${formatDate(row.dueOn)}`,
                      row.project === null ? null : `работа «${row.project.title}»`,
                      `поставлено ${formatDate(row.createdAt)}`,
                    ]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </Text>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip>{ASSIGNMENT_STATUS_LABEL[row.status]}</Chip>
                    {days === null ? null : <Chip tone="accent">{`просрочено на ${days} ${plural(days, 'день', 'дня', 'дней')}`}</Chip>}
                    {isOpen ? (
                      <Form action={assignmentStatusAction} inline>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value="WITHDRAWN" />
                        <input type="hidden" name="back" value="manage" />
                        <Button tone="quiet">Отозвать</Button>
                      </Form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Shell>
  );
}
