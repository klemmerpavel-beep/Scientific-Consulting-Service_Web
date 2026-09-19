import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  ButtonLink,
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
  const forExpert = actor.role === 'EXPERT';
  // Без подписанного договора поручения обработки персональных данных
  // эксперт не получает доступа к материалам клиента (ч. 3 ст. 6 152-ФЗ):
  // выборка отдаёт пусто. Пустой перечень читается как «работ нет», и
  // человек ждёт назначения, которого уже дождался, — причину надо назвать
  // (решение Р-150).
  const awaitingNda = forExpert && actor.expertNdaSignedAt === null;
  // Эксперт в канал переписки не входит, поэтому перехода к нему не видит.
  const mayWrite = actor.role !== 'EXPERT';

  return (
    <Shell actor={actor} current="/cabinet/projects">
      {/* Композиционный центр экрана: не список работ, а перечень действий.
          Основная потеря календарного времени — ожидание материалов. */}
      <Heading level={1} style={{ margin: '0 0 24px' }}>
        {forClient ? 'Мои работы' : forExpert ? 'Назначенные работы' : 'Работы практики'}
      </Heading>

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
                      <Chip>до {formatDate(stage.dueOn)}</Chip>
                    )}
                    <ButtonLink href={`/cabinet/stages/${stage.id}`}>
                      Открыть этап
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {awaitingNda ? (
        <Empty title="Доступ к материалам ещё не открыт">
          Он открывается после подписания договора поручения обработки персональных данных.
          Напишите руководителю практики — отметка ставится в кабинете.
        </Empty>
      ) : projects.length === 0 ? (
        <Empty
          title={
            forClient ? 'Работ пока нет' : forExpert ? 'Назначений пока нет' : 'Проектов пока нет'
          }
        />
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
                {/* Тип не дублируется чипом, когда он же стоит заголовком
                    карточки: у всего, что перенесено из книги заказов, это
                    одна и та же строка. */}
                {project.title === project.serviceType.name ? null : (
                  <Chip tone="accent">{project.serviceType.name}</Chip>
                )}
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

              <Heading level={3} style={{ marginBottom: 6, fontSize: 20 }}>
                <a href={`/cabinet/projects/${project.code}`} style={{ color: 'var(--pd-ink)' }}>
                  {project.title}
                </a>
              </Heading>

              {/* Короткое описание заказа: у перенесённых работ заголовок —
                  это тип сопровождения, и без темы карточки неразличимы. */}
              {project.topic === null || project.topic === project.title ? null : (
                <Text muted size={14} style={{ marginBottom: 10 }}>
                  {project.topic}
                </Text>
              )}

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
                  {/* Кабинет называет это работой во всех ролях: два слова
                      об одном заставляли бы читать дважды. */}
                  Открыть работу
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
