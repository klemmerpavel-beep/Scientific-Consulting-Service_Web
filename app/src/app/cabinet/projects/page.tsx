import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../components/cabinet/tokens';
import {
  ButtonLink,
  Button,
  Card,
  Chip,
  Disclosure,
  Field,
  Form,
  Empty,
  Heading,
  Mono,
  Progress,
  ScreenTop,
  Block,
  FilterBar,
  FilterSearch,
  Tabs,
  plural,
  Text,
  formatDate,
  STAGE_STATE_LABEL,
  type StageStateKey,
} from '../../../components/cabinet/ui';
import { unreadByProject } from '../../../lib/cabinet/messages';
import {
  PROJECT_FILTER_FROM,
  listProjects,
  pendingActions,
  type ProjectFilter,
} from '../../../lib/cabinet/queries';
import { currentActor } from '../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

const FILTERS: readonly ProjectFilter[] = ['active', 'waiting', 'done', 'all'];

const FILTER_LABEL: Record<ProjectFilter, string> = {
  active: 'В работе',
  waiting: 'Ждут',
  done: 'Завершённые',
  all: 'Все',
};

export default async function ProjectsScreen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const sp = await searchParams;
  const query = sp.q ?? '';
  const list = await listProjects(actor, {
    // Набор по умолчанию выбирает сама выборка: он зависит от того,
    // сколько работ у человека всего.
    filter: FILTERS.includes(sp.state as ProjectFilter) ? (sp.state as ProjectFilter) : undefined,
    query,
    page: Number(sp.page) || 1,
  });
  const filter = list.filter;
  const projects = list.rows;
  const pendingAll = await pendingActions(actor);
  const unread = await unreadByProject(actor, projects.map((p) => p.id));
  const forClient = actor.role === 'CLIENT';
  const forExpert = actor.role === 'EXPERT';
  const showFilters = list.all > PROJECT_FILTER_FROM;
  // Требуемое действие показывается там, где человек его ищет, — на самой
  // работе. Пока блок «Требует внимания» перечислял этапы независимо от
  // перечня, одна и та же работа стояла на экране дважды: строкой сверху и
  // плашкой ниже, с тем же состоянием в шкале. Сверху остаётся только то,
  // чего в перечне сейчас не видно: отсечённое отбором или ушедшее на
  // другую страницу (решение Р-175).
  const shown = new Set(projects.map((project) => project.code));
  const onPage = new Map(
    pendingAll
      .filter((stage) => shown.has(stage.project.code))
      .map((stage) => [stage.project.code, stage]),
  );
  const pending = pendingAll.filter((stage) => !shown.has(stage.project.code));
  const href = (next: { state?: ProjectFilter; page?: number }) => {
    const params = new URLSearchParams();
    const state = next.state ?? filter;
    if (state !== 'all') params.set('state', state);
    if (query !== '') params.set('q', query);
    if ((next.page ?? 1) > 1) params.set('page', String(next.page));
    const tail = params.toString();
    return tail === '' ? '/cabinet/projects' : `/cabinet/projects?${tail}`;
  };
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
      <ScreenTop style={{ marginBottom: 24 }}>
        <Heading level={1}>
          {forClient ? 'Мои работы' : forExpert ? 'Назначенные работы' : 'Работы практики'}
        </Heading>
      </ScreenTop>

      {showFilters ? (
        <FilterBar>
          <Tabs
            flush
            label="Отбор работ"
            items={FILTERS.map((key) => ({
              href: href({ state: key }),
              label: key === 'waiting' ? (forClient ? 'Ждут меня' : 'Ждут клиента') : FILTER_LABEL[key],
              active: key === filter,
            }))}
          />
          {/* Поиск отправляется на свой же маршрут: состояние экрана целиком
              лежит в адресе, и ссылку на отобранный перечень можно
              сохранить или переслать. */}
          <FilterSearch>
            <Form method="get" inline>
              {filter === 'all' ? null : <input type="hidden" name="state" value={filter} />}
              <Field
                label="Поиск по работам"
                name="q"
                labelHidden
                defaultValue={query}
                placeholder={forClient ? 'Название работы' : 'Название или клиент'}
                minWidth={200}
                dense
              />
              <Button tone="quiet">Найти</Button>
            </Form>
          </FilterSearch>
        </FilterBar>
      ) : null}

      {pending.length === 0 ? null : (
        <Block style={{ marginBottom: 32 }}>
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
                      {stage.project.title}
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
        </Block>
      )}

      {awaitingNda ? (
        <Empty title="Доступ к материалам ещё не открыт">
          Он открывается после подписания договора поручения обработки персональных данных.
          Напишите руководителю практики — отметка ставится в кабинете.
        </Empty>
      ) : projects.length === 0 ? (
        list.all === 0 ? (
          <Empty
            title={
              forClient ? 'Работ пока нет' : forExpert ? 'Назначений пока нет' : 'Работ пока нет'
            }
          />
        ) : (
          // Отбор ничего не нашёл — это не то же самое, что «работ нет»:
          // работы есть, просто не под этим условием.
          <Empty
            title="Ничего не найдено"
            filters={[
              filter === 'all' ? '' : `состояние — ${FILTER_LABEL[filter].toLowerCase()}`,
              query === '' ? '' : `поиск — «${query}»`,
            ]}
            total={list.all}
            resetHref="/cabinet/projects"
          >
            Работы никуда не делись — они не подошли под это условие.
          </Empty>
        )
      ) : (
        <ul
          className="cab-block"
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'grid',
            // `auto-fill`, а не `auto-fit`: пустой трек сохраняется, и
            // единственная найденная работа остаётся плашкой, а не
            // растягивается баннером во всю ширину экрана. Минимум трека
            // ограничен шириной окна — жёсткие 440 px давали
            // горизонтальное переполнение на телефоне (решение Р-175).
            // Не более двух плашек в ряду — требование заказчика:
            // три ужатые плашки наезжают друг на друга и читаются хуже
            // двух просторных (решение Р-189). Ниже 900 px ряд
            // становится одиночным сам собой.
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px,100%),1fr))',
            maxWidth: 'calc(2 * 560px + 16px)',
            // Плашки в ряду одного размера — требование заказчика: ряд
            // из карточек разной высоты читается как сбой раскладки
            // (решение Р-185). Чтобы выровненная плашка не пустовала,
            // строка фактов прижата к её низу.
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

            const waiting = onPage.get(project.code) ?? null;

            return (
              <Card
                as="li"
                key={project.id}
                link
                style={{
                  padding: '16px 20px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  ...(waiting === null ? {} : { borderColor: 'var(--pd-accent-edge)' }),
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  {/* Код работы с экранов убран: он ничего не говорит
                      человеку и сбивает при чтении плашки (замечание
                      заказчика, решение Р-189). В адресе страницы код
                      остаётся — он ключ маршрута. */}
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
                {/* Плашка — раздел перечня, и её заголовок второго уровня:
                    блок «Требует внимания» появляется не всегда, и при его
                    отсутствии третий уровень оказывался сразу после
                    первого — пропуск, который ловит правило облика. */}
                <Heading level={2} size={3} style={{ marginBottom: 4 }}>
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
                  <Text
                    muted
                    size={13}
                    style={{
                      margin: '0 0 10px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {project.topic}
                  </Text>
                )}

                {/* Работа без плана говорит, что будет дальше: прежде у
                    неё не было ни шкалы, ни строки фактов, и плашка
                    молчала вовсе (решение Р-182). */}
                {project.stages.length > 0 ? null : (
                  <Text muted size={13} style={{ margin: '0 0 2px' }}>
                    {forClient
                      ? 'План работ ещё составляется: куратор заведёт этапы и сообщит.'
                      : 'План работ не заведён: этапы задаются на экране работы.'}
                  </Text>
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

                {/* Требуемое действие стоит на самой работе и ведёт прямо
                    на этап: отдельной строкой сверху оно повторяло бы то,
                    что и так видно в шкале (решение Р-175). */}
                {waiting === null ? null : (
                  <Text size={13} style={{ marginTop: 10 }}>
                    <a href={`/cabinet/stages/${waiting.id}`}>
                      {waiting.state === 'AWAITING_CLIENT'
                        ? `Загрузить материалы: ${waiting.title}`
                        : `Согласовать этап: ${waiting.title}`}
                    </a>
                    {waiting.dueOn === null ? '' : ` — до ${formatDate(waiting.dueOn)}`}
                  </Text>
                )}

                {/* Строка фактов прижата к низу: в ряду равной высоты
                    она встаёт у всех плашек на одной линии, и ряд
                    читается таблицей, а не лесенкой (решение Р-185). */}
                <Text muted size={13} style={{ marginTop: 'auto', paddingTop: 10 }}>
                  {facts.length === 0 ? '\u00A0' : facts.join(' · ')}
                </Text>

                {/* Плашка раскрывается на месте: план работ виден без
                    ухода с перечня, а в саму работу ведёт её название.
                    Раскрытие неполное — этапы и сроки, остальное на
                    экране работы (замечание заказчика, решение Р-189).
                    Собрано на `details`, без клиентского кода. */}
                {project.stages.length === 0 ? null : (
                  <Disclosure
                    title={`Этапы · ${project.stages.length}`}
                    style={{ marginTop: 12 }}
                  >
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {project.stages.map((stage, index) => (
                        <li
                          key={stage.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0,1fr) auto',
                            gap: 12,
                            alignItems: 'baseline',
                            paddingTop: index === 0 ? 0 : 10,
                            paddingBottom: 10,
                            ...(index === 0
                              ? {}
                              : { borderTop: '1px solid var(--pd-divider)' }),
                          }}
                        >
                          <a
                            href={`/cabinet/stages/${stage.id}`}
                            style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5 }}
                          >
                            {stage.title}
                          </a>
                          <Text muted size={13} style={{ whiteSpace: 'nowrap' }}>
                            {STAGE_STATE_LABEL[stage.state as StageStateKey]}
                            {stage.dueOn === null ? '' : ` · ${formatDate(stage.dueOn)}`}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      {list.pages <= 1 ? null : (
        <nav
          aria-label="Страницы перечня"
          style={{
            display: 'flex',
            gap: 20,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: 24,
          }}
        >
          {list.page > 1 ? (
            <a className="cab-mark" href={href({ page: list.page - 1 })}>
              Предыдущие
            </a>
          ) : null}
          <Text muted size={14}>
            Страница {list.page} из {list.pages} · всего {list.total}{' '}
            {plural(list.total, 'работа', 'работы', 'работ')}
          </Text>
          {list.page < list.pages ? (
            <a className="cab-mark" href={href({ page: list.page + 1 })}>
              Следующие
            </a>
          ) : null}
        </nav>
      )}
    </Shell>
  );
}
