import { redirect } from 'next/navigation';

import ActionError from '../../../components/cabinet/ActionError';
import Shell from '../../../components/cabinet/Shell';
import { Button, Card, Chip, Empty, Form, Narrow, ScreenHead, Text, formatDate, plural } from '../../../components/cabinet/ui';
import { ASSIGNMENT_STATUS_LABEL, isAssignmentOverdue, myAssignments } from '../../../lib/cabinet/assignments';
import { daysPast, now as clockNow } from '../../../lib/cabinet/clock';
import { homeFor } from '../../../lib/cabinet/nav';
import { requireActor } from '../../../lib/cabinet/session';
import { assignmentStatusAction } from '../actions';

export const dynamic = 'force-dynamic';

/**
 * Поручения руководителя — исполнителю (требование РК-19, решение Р-352).
 * Менеджер и куратор видят свои открытые поручения и сами отмечают «в
 * работе» и «сделано»; сделанное уходит, руководителю — уведомление.
 */
export default async function MyAssignmentsScreen({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor('/cabinet/assignments');
  if (actor.role === 'HEAD') redirect('/cabinet/manage/assignments');
  if (actor.role !== 'MANAGER' && actor.role !== 'EXPERT') redirect(homeFor(actor));
  const flags = await searchParams;
  const rows = await myAssignments(actor);
  const at = clockNow();
  const home = homeFor(actor);

  return (
    <Shell actor={actor} current={home}>
      <Narrow width={780}>
        <ScreenHead
          backHref={home}
          backLabel={actor.role === 'MANAGER' ? 'Сегодня' : 'Назначенные работы'}
          title="Поручения руководителя"
          note="Отметьте «в работе», когда взялись, и «сделано», когда закончили: руководитель получит уведомление."
        />
        <ActionError id={flags.error} />
        {rows.length === 0 ? (
          <Empty title="Открытых поручений нет">Новое поручение придёт уведомлением и встанет в дела первого экрана.</Empty>
        ) : (
          <Card>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
              {rows.map((row) => {
                const days = isAssignmentOverdue(row, at) ? daysPast(row.dueOn, at) : null;
                const form = (status: string, label: string) => (
                  <Form action={assignmentStatusAction} inline>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value={status} />
                    <Button tone="quiet">{label}</Button>
                  </Form>
                );
                return (
                  <li key={row.id} style={{ borderBottom: '1px solid var(--pd-divider)', paddingBottom: 14 }}>
                    <Text size={15}>{row.text}</Text>
                    <Text muted size={13} style={{ marginTop: 6 }}>
                      {[
                        `срок ${formatDate(row.dueOn)}`,
                        row.project === null ? null : `работа «${row.project.title}»`,
                        row.createdBy === null ? null : `поставил ${row.createdBy.fullName}`,
                      ]
                        .filter((part) => part !== null)
                        .join(' · ')}
                    </Text>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                      <Chip>{ASSIGNMENT_STATUS_LABEL[row.status]}</Chip>
                      {days === null ? null : <Chip tone="accent">{`просрочено на ${days} ${plural(days, 'день', 'дня', 'дней')}`}</Chip>}
                      {row.status === 'ASSIGNED' ? form('IN_PROGRESS', 'В работу') : null}
                      {form('DONE', 'Сделано')}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Narrow>
    </Shell>
  );
}
