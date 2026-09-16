import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Card,
  Chip,
  Empty,
  Heading,
  Mono,
  STAGE_STATE_LABEL,
  Stepper,
  plural,
  Text,
  formatDate,
  type StageStateKey,
} from '../../../components/cabinet/ui';
import { SANS } from '../../../components/cabinet/tokens';
import { unreadByProject } from '../../../lib/cabinet/messages';
import { listProjects, pendingActions } from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

export default async function ProjectsScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const [projects, pending] = await Promise.all([listProjects(actor), pendingActions(actor)]);
  const unread = await unreadByProject(actor, projects.map((p) => p.id));
  const forClient = actor.role === 'CLIENT';
  // Эксперт в канал переписки не входит, поэтому перехода к нему не видит.
  const mayWrite = actor.role !== 'EXPERT';

  return (
    <Shell actor={actor} current="/cabinet/projects">
      {/* Композиционный центр экрана: не список работ, а перечень действий.
          Основная потеря календарного времени — ожидание материалов. */}
      {pending.length === 0 ? null : (
        <section style={{ marginBottom: 32 }}>
          <Mono>{forClient ? 'Сейчас от вас требуется' : 'Требует внимания'}</Mono>
          <Card style={{ marginTop: 12, borderColor: 'var(--pd-accent-edge)' }}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
              {pending.map((stage) => (
                <li
                  key={stage.id}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                    <Heading level={3}>
                      {stage.state === 'AWAITING_CLIENT'
                        ? `Загрузить материалы: ${stage.title}`
                        : `Согласовать этап: ${stage.title}`}
                    </Heading>
                    <Text muted size={14} style={{ marginTop: 4 }}>
                      {stage.project.code} · {stage.project.title}
                    </Text>
                    {stage.blockedReason === null ? null : (
                      <Text size={14} style={{ marginTop: 8 }}>
                        {stage.blockedReason}
                      </Text>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {stage.dueOn === null ? null : (
                      <Chip tone="warn">до {formatDate(stage.dueOn)}</Chip>
                    )}
                    <a
                      href={`/cabinet/stages/${stage.id}`}
                      className="cab-btn cab-btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 44,
                        padding: '0 20px',
                        borderRadius: 999,
                        background: 'var(--pd-accent)',
                        color: 'var(--pd-ink-inverse)',
                        fontFamily: SANS,
                        fontSize: 15,
                        fontWeight: 500,
                      }}
                    >
                      Открыть этап
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <Mono>{forClient ? 'Мои работы' : 'Проекты'}</Mono>
      <Heading level={1} style={{ margin: '12px 0 24px' }}>
        {forClient ? 'Проекты сопровождения' : 'Проекты практики'}
      </Heading>

      {projects.length === 0 ? (
        <Empty title="Проектов пока нет">
          {forClient
            ? 'Как только заявка будет одобрена, проект появится здесь вместе с планом этапов.'
            : 'Одобрите заявку в очереди — проект появится здесь.'}
        </Empty>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 20 }}>
          {projects.map((project) => (
            <Card as="li" key={project.id} style={{ padding: '22px 24px' }}>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 12,
                }}
              >
                <Chip tone="accent">{project.serviceType.name}</Chip>
                <Chip mono>{project.code}</Chip>
                {project.dueOn === null ? null : (
                  <Text muted size={14}>
                    срок — {formatDate(project.dueOn)}
                  </Text>
                )}
                {forClient ? null : (
                  <Text muted size={14}>
                    {project.client.fullName}
                  </Text>
                )}
              </div>

              <Heading level={2} style={{ marginBottom: 16 }}>
                <a
                  href={`/cabinet/projects/${project.code}`}
                  style={{ color: 'var(--pd-ink)' }}
                >
                  {project.title}
                </a>
              </Heading>

              <Stepper
                items={project.stages.map((stage) => ({
                  id: stage.id,
                  title: stage.title,
                  state: stage.state as StageStateKey,
                  dueOn: formatDate(stage.dueOn),
                  href: `/cabinet/stages/${stage.id}`,
                }))}
              />

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginTop: 16,
                }}
              >
                <Text muted size={13}>
                  {project.stages.filter((s) => s.state === 'DONE').length} из{' '}
                  {project.stages.length}{' '}
                  {plural(project.stages.length, 'этапа', 'этапов', 'этапов')} завершено
                  {project.stages.some((s) => s.state === 'AWAITING_CLIENT')
                    ? ` · есть этап в состоянии «${STAGE_STATE_LABEL.AWAITING_CLIENT}»`
                    : ''}
                </Text>
                {mayWrite ? (
                  <a
                    href={`/cabinet/projects/${project.code}/messages`}
                    style={{ marginLeft: 'auto', fontFamily: SANS, fontSize: 14 }}
                  >
                    Переписка с менеджером
                    {(unread.get(project.id) ?? 0) > 0
                      ? ` · ${unread.get(project.id)} новых`
                      : ''}
                  </a>
                ) : null}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </Shell>
  );
}
