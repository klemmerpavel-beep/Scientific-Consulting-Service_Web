import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Card,
  Chip,
  Empty,
  Heading,
  Mono,
  Progress,
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
      <Mono>{forClient ? 'Мои работы' : 'Проекты'}</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        {forClient ? 'Проекты сопровождения' : 'Проекты практики'}
      </Heading>
      <Text muted style={{ marginBottom: 28 }}>
        {forClient
          ? 'Здесь видно, на каком этапе каждая работа и что требуется от вас.'
          : 'Работы практики: состояние этапов, сроки и переписка.'}
      </Text>

      {pending.length === 0 ? null : (
        <section style={{ marginBottom: 32 }}>
          <Heading level={2} style={{ marginBottom: 12 }}>
            {forClient ? 'Сейчас от вас требуется' : 'Требует внимания'}
          </Heading>
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

              <Heading level={3} style={{ marginBottom: 10, fontSize: 20 }}>
                <a href={`/cabinet/projects/${project.code}`} style={{ color: 'var(--pd-ink)' }}>
                  {project.title}
                </a>
              </Heading>

              {/* Состояние работы называется словом и стоит в карточке
                  перечня: чтобы понять, где работа, открывать её не нужно. */}
              <Progress
                done={project.stages.filter((s) => s.state === 'DONE').length}
                total={project.stages.length}
                current={(() => {
                  const stage = project.stages.find((s) => s.state !== 'DONE');
                  return stage === undefined
                    ? null
                    : { title: stage.title, state: stage.state as StageStateKey };
                })()}
              />

              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginTop: 14,
                }}
              >
                <a className="cab-mark" href={`/cabinet/projects/${project.code}`}>
                  {forClient ? 'Открыть работу' : 'Открыть проект'}
                </a>
                {mayWrite ? (
                  <a
                    className="cab-mark"
                    href={`/cabinet/projects/${project.code}/messages`}
                    style={{ marginLeft: 'auto' }}
                  >
                    {forClient ? 'Написать куратору' : 'Переписка'}
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
