import { notFound, redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Field,
  Form,
  FormActions,
  Notice,
  ScreenHead,
  Text,
  plural,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { formDraft } from '../../../../../lib/cabinet/flash';
import {
  PROJECT_STATUS_ACTION,
  PROJECT_STATUS_LABEL,
  canChangeProjectStatus,
  type ProjectStatusKey,
} from '../../../../../lib/cabinet/project-status';
import { pendingReview, projectByCode } from '../../../../../lib/cabinet/queries';
import { requireActor } from '../../../../../lib/cabinet/session';
import { changeProjectStatus } from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * Последствия перехода — словами, до нажатия (требование М-09, решение
 * Р-299). Прежде выбранное в списке состояние применялось сразу, без
 * причины и без письма клиенту.
 */
const CONSEQUENCES: Record<ProjectStatusKey, readonly string[]> = {
  PAUSED: [
    'Этапы перестанут меняться; срок согласования этапа остановится и продолжится на остаток после возобновления.',
    'Материалы, замечания и переписка продолжают работать.',
    'Клиент получит письмо с причиной.',
  ],
  COMPLETED: [
    'Работа уйдёт в «Завершённые», дата закрытия — сегодня.',
    'Материалы, замечания, карточка и исполнитель станут только для чтения; переписка и документы оплат доступны.',
    'Клиент получит письмо: материалы остаются доступны в кабинете.',
  ],
  CANCELLED: [
    'Работа уйдёт в «Завершённые», дата закрытия — сегодня.',
    'Материалы, замечания, карточка и исполнитель станут только для чтения; переписка и документы оплат доступны.',
    'Клиент получит письмо с причиной.',
  ],
  ACTIVE: [
    'Этапы снова можно переводить; срок согласования продолжится на остаток рабочих дней.',
    'Материалы и замечания снова принимаются.',
    'Клиент получит письмо о возобновлении.',
  ],
};

/** Причина для клиента обязательна при приостановке и отмене. */
const NEEDS_REASON: ReadonlySet<ProjectStatusKey> = new Set(['PAUSED', 'CANCELLED']);

export default async function ProjectStatusScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ to?: string; error?: string }>;
}) {
  const actor = await requireActor(`/cabinet/projects/${(await params).code}/status`);

  const { code } = await params;
  const project = await projectByCode(actor, decodeURIComponent(code));
  if (project === null) notFound();
  const ref = {
    id: project.id,
    clientId: project.clientId,
    managerId: project.managerId,
    expertId: project.expertId,
  };
  if (!can(actor, 'PROJECT_EDIT', ref)) redirect(`/cabinet/projects/${project.code}`);

  const sp = await searchParams;
  const from = project.status as ProjectStatusKey;
  const to = sp.to as ProjectStatusKey | undefined;
  if (to === undefined || !Object.hasOwn(PROJECT_STATUS_LABEL, to) || !canChangeProjectStatus(from, to)) {
    redirect(`/cabinet/projects/${project.code}#manage`);
  }
  const draft = (await formDraft(sp.error)) ?? {};
  const review = to === 'COMPLETED' || to === 'CANCELLED' ? await pendingReview(actor, project.id) : null;

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={`/cabinet/projects/${project.code}`}
        backLabel={project.title}
        title={`${PROJECT_STATUS_ACTION[to]} работу`}
        note={`Сейчас работа ${PROJECT_STATUS_LABEL[from].toLowerCase()}.`}
      />

      <Card>
        <ActionError id={sp.error} />
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'grid', gap: 6 }}>
          {CONSEQUENCES[to].map((line) => (
            <li key={line}>
              <Text size={15} style={{ margin: 0 }}>
                {line}
              </Text>
            </li>
          ))}
        </ul>

        {/* Неразобранное после закрытия разобрать будет нельзя (ОМ-17, Р-293). */}
        {review !== null && review.comments + review.versions > 0 ? (
          <div style={{ marginBottom: 16 }}>
            <Notice tone="quiet" role="status">
              {[
                review.comments === 0
                  ? null
                  : `${review.comments} ${plural(review.comments, 'замечание', 'замечания', 'замечаний')} на модерации`,
                review.versions === 0
                  ? null
                  : `${review.versions} ${plural(review.versions, 'версия', 'версии', 'версий')} эксперта на публикации`,
              ]
                .filter((part) => part !== null)
                .join(', ')}
              : после закрытия разобрать их будет нельзя.
            </Notice>
          </div>
        ) : null}

        <Form action={changeProjectStatus}>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="code" value={project.code} />
          <input type="hidden" name="status" value={to} />
          {NEEDS_REASON.has(to) ? (
            <Field
              label="Причина для клиента"
              name="reason"
              multiline
              required
              defaultValue={draft.reason ?? ''}
              hint="Клиент получит её письмом; в мессенджер уходит только сигнал без причины."
            />
          ) : null}
          <FormActions>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button>{PROJECT_STATUS_ACTION[to]}</Button>
              <ButtonLink href={`/cabinet/projects/${project.code}#manage`}>Отмена</ButtonLink>
            </div>
          </FormActions>
        </Form>
      </Card>
    </Shell>
  );
}
