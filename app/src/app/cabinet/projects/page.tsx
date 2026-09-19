import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../components/cabinet/tokens';
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
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(440px,1fr))',
            gap: 16,
          }}
        >
          {projects.map((project) => {
            const done = project.stages.filter((stage) => stage.state === 'DONE').length;
            const currentStage = project.stages.find((stage) => stage.state !== 'DONE') ?? null;
            const newMessages = unread.get(project.id) ?? 0;
            // Строка под шкалой отвечает на вопрос «что с этим заказом» без
            // захода внутрь: сколько этапов сделано, сколько приложено
            // материалов, есть ли непрочитанное (решение Р-169).
            const facts = [
              project.stages.length === 0
                ? null
                : `${done} из ${project.stages.length} ${plural(project.stages.length, 'этапа', 'этапов', 'этапов')}`,
              project._count.materials === 0
                ? null
                : `${project._count.materials} ${plural(project._count.materials, 'материал', 'материала', 'материалов')}`,
              newMessages === 0
                ? null
                : `${newMessages} ${plural(newMessages, 'новое сообщение', 'новых сообщения', 'новых сообщений')}`,
              forClient ? null : project.client.fullName,
            ].filter((fact) => fact !== null);

            return (
              <Card as="li" key={project.id} link style={{ padding: '16px 20px 18px' }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  <Chip mono>{project.code}</Chip>
                  {/* Тип не дублируется чипом, когда он же стоит заголовком
                      карточки: у всего, что перенесено из книги заказов, это
                      одна и та же строка. */}
                  {project.title === project.serviceType.name ? null : (
                    <Chip tone="accent">{project.serviceType.name}</Chip>
                  )}
                  {project.stages.length === 0 ? <Chip>план не заведён</Chip> : null}
                  {project.dueOn === null ? null : (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontFamily: MONO,
                        fontSize: 13,
                        lineHeight: 1.4,
                        color: 'var(--pd-ink-muted)',
                      }}
                    >
                      срок — {formatDate(project.dueOn)}
                    </span>
                  )}
                </div>

                {/* Заголовок ведёт внутрь: отдельная строка «Открыть работу»
                    под каждой плашкой стоила у эксперта восемьсот пикселей
                    и вела туда же. */}
                <Heading level={3} style={{ marginBottom: 4 }}>
                  <a href={`/cabinet/projects/${project.code}`} style={{ color: 'var(--pd-ink)' }}>
                    {project.title}
                  </a>
                </Heading>

                {/* Короткое описание заказа: у перенесённых работ заголовок —
                    это тип сопровождения, и без темы карточки неразличимы. */}
                {/* Тема ограничена двумя строками: в наполнении она доходит
                    до трёхсот пятидесяти знаков, и одна такая работа
                    растягивала весь ряд плашек (решение Р-169). Целиком
                    тема стоит на экране заказа. */}
                {project.topic === null || project.topic === project.title ? null : (
                  <p
                    style={{
                      margin: '0 0 10px',
                      fontFamily: SANS,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--pd-ink-muted)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {project.topic}
                  </p>
                )}

                {/* Состояние работы называется словом и стоит в плашке:
                    чтобы понять, где работа, открывать её не нужно. */}
                <Progress
                  done={done}
                  total={project.stages.length}
                  current={
                    currentStage === null
                      ? null
                      : { title: currentStage.title, state: currentStage.state as StageStateKey }
                  }
                />

                {facts.length === 0 ? null : (
                  <Text muted size={13} style={{ marginTop: 10 }}>
                    {facts.join(' · ')}
                  </Text>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
