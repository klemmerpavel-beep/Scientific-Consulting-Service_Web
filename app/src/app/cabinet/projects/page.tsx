import type { ReactNode } from 'react';
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
  ScreenHead,
  ScreenTop,
  Select,
  Block,
  FilterBar,
  FilterSearch,
  Tabs,
  clip,
  plural,
  Text,
  formatDay,
  formatTime,
  formatDate,
  stageLabel,
  type StageStateKey,
  Pager,
} from '../../../components/cabinet/ui';
import { unreadByProject } from '../../../lib/cabinet/messages';
import {
  PROJECT_FILTER_FROM,
  listProjects,
  curatorTasksData,
  curators,
  experts,
  liveWorks,
  pendingActions,
  type ProjectFilter,
} from '../../../lib/cabinet/queries';
import { daysPast, now } from '../../../lib/cabinet/clock';
import { can, staffExpertLine } from '../../../lib/cabinet/access';
import { requireActor } from '../../../lib/cabinet/session';
import { soleWorkTarget } from '../../../lib/cabinet/nav';
import { welcomeState } from '../../../lib/cabinet/channels';
import { dismissWelcome, requestNdaAction, startTelegramBind } from '../actions';
import ActionError from '../../../components/cabinet/ActionError';
import { ndaRequestedAt } from '../../../lib/cabinet/admin';
import { CURATOR_WELCOME, ndaRequestOpen } from '../../../lib/cabinet/curator-welcome';
import { myAssignments } from '../../../lib/cabinet/assignments';
import { MONTH_NAMES } from '../../../lib/cabinet/analytics/calendar';

export const dynamic = 'force-dynamic';

const FILTERS: readonly ProjectFilter[] = ['active', 'waiting', 'done', 'all'];

// «Действующие», а не «В работе»: работа, ждущая клиента, тоже действует,
// и под вкладкой «В работе» она читалась как ошибка отбора — рядом стоит
// вкладка «Ждут» с той же работой (решение Р-206).
const FILTER_LABEL: Record<ProjectFilter, string> = {
  active: 'Действующие',
  waiting: 'Ждут',
  done: 'Завершённые',
  all: 'Все',
};

export default async function ProjectsScreen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requireActor('/cabinet/projects');

  const sp = await searchParams;
  const query = sp.q ?? '';
  const list = await listProjects(actor, {
    // Набор по умолчанию выбирает сама выборка: он зависит от того,
    // сколько работ у человека всего.
    filter: FILTERS.includes(sp.state as ProjectFilter) ? (sp.state as ProjectFilter) : undefined,
    query,
    page: Number(sp.page) || 1,
    manager: sp.manager,
    curator: sp.curator,
    due: sp.due,
  });
  const filter = list.filter;
  const projects = list.rows;
  const pendingAll = await pendingActions(actor);
  const unread = await unreadByProject(actor, projects.map((p) => p.id));
  const forClient = actor.role === 'CLIENT';
  // Блок первого входа — пока клиент его не закрыл (требование Т-10,
  // решение Р-310).
  const welcome = await welcomeState(actor);
  // Одна действующая или приостановленная работа — сразу её карточка:
  // перечень из одной строки — лишнее нажатие (требование Т-09, О-3, О-11,
  // решение Р-311). Пока открыт блок первого входа, клиент видит его здесь;
  // отбор в адресе — просьба о перечне, и она исполняется.
  const sole = soleWorkTarget({
    role: actor.role,
    welcomeOpen: welcome.open,
    asked: sp.state !== undefined || sp.q !== undefined || sp.page !== undefined,
    all: list.all,
    rows: projects,
  });
  if (sole !== null) redirect(sole);
  const forExpert = actor.role === 'EXPERT';
  const showFilters = list.all > PROJECT_FILTER_FROM;
  // Требуемое действие показывается там, где человек его ищет, — на самой
  // работе. Пока блок «Требует внимания» перечислял этапы независимо от
  // перечня, одна и та же работа стояла на экране дважды: строкой сверху и
  // плашкой ниже, с тем же состоянием в шкале. Сверху остаётся только то,
  // чего в перечне сейчас не видно: отсечённое отбором или ушедшее на
  // другую страницу (решение Р-175).
  const shown = new Set(projects.map((project) => project.code));
  // На плашке — первое дело по работе, то же, что называет ответ в шапке:
  // `new Map` из пар оставлял последнее, и ответ и плашка называли разные
  // этапы одной работы (решение Р-213).
  const onPage = new Map<string, (typeof pendingAll)[number]>();
  for (const stage of pendingAll) {
    if (shown.has(stage.project.code) && !onPage.has(stage.project.code)) {
      onPage.set(stage.project.code, stage);
    }
  }
  // Эксперту блок «Требует внимания» с чужими действиями не нужен: ждут
  // здесь клиента, а не его (решение Р-206).
  // Первое дело клиента названо ответом в шапке — второй раз блоком ниже
  // оно не повторяется.
  const pending = forExpert
    ? []
    : pendingAll.filter(
        (stage) =>
          !shown.has(stage.project.code) && !(forClient && stage.id === pendingAll[0]?.id),
      );
  /**
   * Что ждут по этапу — глазами смотрящего. Клиенту это задание, практике —
   * сведение о том, чей ход: «Загрузить материалы» у эксперта и
   * руководителя читалось как поручение им (решение Р-206).
   */
  const tabLabel = (key: ProjectFilter) =>
    key === 'waiting' ? (forClient ? 'Ждут меня' : 'Ждут клиента') : FILTER_LABEL[key];
  const waitingLine = (stage: { state: string; title: string }) =>
    forClient
      ? stage.state === 'AWAITING_CLIENT'
        ? `Загрузить материалы: ${stage.title}`
        : `Согласовать этап: ${stage.title}`
      : stage.state === 'AWAITING_CLIENT'
        ? `Ждём материалов клиента: ${stage.title}`
        : `На согласовании у клиента: ${stage.title}`;
  const forHead = actor.role === 'HEAD';
  // Отбор по сотруднику — руководителю; сохраняется в адресе (РК-03, Р-341).
  const person = forHead ? { manager: sp.manager ?? '', curator: sp.curator ?? '' } : { manager: '', curator: '' };
  // Отбор по месяцу срока — из числа «К пику» на «Команде» (РК-22, Р-354).
  const dueKey = /^\d{4}-(0[1-9]|1[0-2])$/u.test(sp.due ?? '') ? sp.due! : null;
  const [managerList, curatorChoices] = forHead ? await Promise.all([curators(actor), experts(actor)]) : [[], []];
  const href = (next: { state?: ProjectFilter; page?: number }) => {
    const params = new URLSearchParams();
    const state = next.state ?? filter;
    if (state !== 'all') params.set('state', state);
    if (query !== '') params.set('q', query);
    if (person.manager !== '') params.set('manager', person.manager);
    if (person.curator !== '') params.set('curator', person.curator);
    if (dueKey !== null) params.set('due', dueKey);
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
  // «Сообщить руководителю» — не чаще раза в сутки; после нажатия —
  // строка о том, когда руководитель получил уведомление (Э-12, Р-331).
  const askedAt = awaitingNda ? await ndaRequestedAt(actor) : null;
  // Эксперт в канал переписки не входит, поэтому перехода к нему не видит.
  const mayWrite = actor.role !== 'EXPERT';


  // Ответ экрана одной фразой — клиенту и эксперту: что от них нужно и с
  // чего начать. Работы практики у менеджера и руководителя отвечают
  // сводкой, и там перечень остаётся перечнем (решение Р-207).
  // Менеджер видит только свои работы, и заголовок говорит это прямо — как
  // пункт меню (требование М-05, решение Р-305).
  const title =
    forClient || actor.role === 'MANAGER' ? 'Мои работы' : forExpert ? 'Назначенные работы' : 'Работы';
  const live = (forClient || forExpert ? await liveWorks(actor) : [])
    .map((project) => ({
      project,
      stage: project.stages.find((stage) => stage.state !== 'DONE') ?? null,
    }));
  const nearest =
    live
      .filter((row) => row.stage?.dueOn != null)
      .sort((a, b) => a.stage!.dueOn!.getTime() - b.stage!.dueOn!.getTime())[0] ?? null;
  const dueLine = (row: typeof nearest) =>
    row === null || row.stage === null || row.stage.dueOn === null
      ? null
      : daysPast(row.stage.dueOn) === null
        ? `Ближайший срок — ${formatDate(row.stage.dueOn)}, этап «${clip(row.stage.title, 60)}».`
        : `Срок этапа «${clip(row.stage.title, 60)}» прошёл ${formatDate(row.stage.dueOn)}.`;
  let answer: { lead: string; detail?: string | null; action?: ReactNode } | undefined;
  if (forClient) {
    const first = pendingAll[0] ?? null;
    answer =
      first !== null
        ? {
            lead:
              first.state === 'AWAITING_CLIENT'
                ? `От вас ждут материалы к этапу «${clip(first.title, 48)}».`
                : `От вас ждут согласования этапа «${clip(first.title, 48)}».`,
            // Срок — первым: пояснение режется тремя строками, и на
            // телефоне срок уходил за многоточие (решение Р-213).
            detail: [
              // На согласовании клиента ждут к сроку согласования, а не к
              // сроку этапа (требование Т-15, решение Р-290).
              first.state === 'IN_APPROVAL' && first.approvalDueOn !== null
                ? `Срок согласования — до ${formatDate(first.approvalDueOn)} включительно.`
                : first.dueOn === null
                  ? null
                  : `Срок этапа — ${formatDate(first.dueOn)}.`,
              first.state === 'AWAITING_CLIENT'
                ? `Работа «${clip(first.project.title, 60)}» стоит, пока их нет.`
                : `Работа «${clip(first.project.title, 60)}» продолжится после вашего согласования.`,
              pendingAll.length > 1 ? `Ещё дел за вами: ${pendingAll.length - 1}.` : null,
            ]
              .filter((part) => part !== null)
              .join(' '),
            action: <ButtonLink href={`/cabinet/stages/${first.id}`}>Открыть этап</ButtonLink>,
          }
        : live.length > 0
          ? {
              lead:
                live.length === 1
                  ? 'Сейчас от вас ничего не требуется — работа идёт.'
                  : 'Сейчас от вас ничего не требуется — работы идут.',
              detail: dueLine(nearest),
            }
          : {
              lead: 'Действующих работ нет.',
              detail: 'Заявку на сопровождение новой работы можно оставить здесь же.',
              action: <ButtonLink href="/cabinet/request">Новая заявка</ButtonLink>,
            };
  } else if (forExpert && !awaitingNda) {
    // Ответ куратору — главное дело по ближайшему сроку, число остальных и
    // кнопка на экран, где дело закрывается. «Не начат» делом не является:
    // этап запускает менеджер (требование Э-04, решение Р-329).
    const tasks = await curatorTasksData(actor);
    const main = tasks[0] ?? null;
    answer =
      main === null
        ? {
            lead: 'Сейчас ход не за вами.',
            detail:
              live.length === 0
                ? 'Действующих назначений нет.'
                : 'Этапы ваших работ сданы менеджеру, ждут клиента, ещё не запущены или закрыты; менеджер сообщит, когда продолжать.',
          }
        : {
            lead: `${main.label}.`,
            detail: [
              `Работа «${clip(main.work, 60)}».`,
              main.dueOn === null
                ? null
                : daysPast(main.dueOn) === null
                  ? `Срок этапа — ${formatDate(main.dueOn)}.`
                  : `Срок этапа прошёл ${formatDate(main.dueOn)}.`,
              tasks.length > 1 ? `Ещё дел: ${tasks.length - 1}.` : null,
            ]
              .filter((part) => part !== null)
              .join(' '),
            action: <ButtonLink href={main.href}>{main.action}</ButtonLink>,
          };
  }

  // Поручения руководителя — в делах первого экрана куратора (РК-19, Р-352).
  const assigned = forExpert ? await myAssignments(actor) : [];
  const assignedLate = assigned.filter((row) => daysPast(row.dueOn) !== null).length;

  return (
    <Shell actor={actor} current="/cabinet/projects">
      {/* Композиционный центр экрана — ответ: что от человека нужно
          сейчас. Основная потеря календарного времени — ожидание
          материалов (решение Р-207). */}
      {answer === undefined ? (
        <ScreenTop style={{ marginBottom: 24 }}>
          <Heading level={1}>{title}</Heading>
          {/* Заказ звонком или письмом заводится здесь же (решение Р-269). */}
          {can(actor, 'REQUEST_MODERATE') ? (
            <div style={{ marginLeft: 'auto' }}>
              <ButtonLink href="/cabinet/manage/orders/new">Новый заказ</ButtonLink>
            </div>
          ) : null}
        </ScreenTop>
      ) : (
        <ScreenHead title={title} answer={answer} />
      )}
      {assigned.length === 0 ? null : (
        <Text size={14} style={{ marginBottom: 20 }}>
          {`Поручения руководителя: ${assigned.length}${assignedLate === 0 ? '' : `, из них просрочено ${assignedLate}`} — `}
          <a className="cab-mark" href="/cabinet/assignments">
            открыть и отметить
          </a>
        </Text>
      )}

      {/* Первый вход: три строки вместо пошагового тура, под ответом, а не
          поверх экрана; «Понятно» закрывает блок навсегда (требование Т-10,
          решение Р-310). */}
      {/* Куратору — свой блок: где ход за ним, как сдать этап, как
          спросить менеджера, и два правила работы (требование Э-12,
          решение Р-331). */}
      {welcome.open && forExpert ? (
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 10 }}>
            {CURATOR_WELCOME.title}
          </Heading>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20, display: 'grid', gap: 6 }}>
            {CURATOR_WELCOME.lines.map((line) => (
              <li key={line} style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
                {line}
              </li>
            ))}
          </ul>
          <Text muted size={14} style={{ marginBottom: 6 }}>
            Два правила:
          </Text>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'grid', gap: 6 }}>
            {CURATOR_WELCOME.rules.map((rule) => (
              <li key={rule} style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
                {rule}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {welcome.telegram ? (
              <Form action={startTelegramBind} inline>
                <Button tone="quiet">Подключить Telegram</Button>
              </Form>
            ) : null}
            <Form action={dismissWelcome} inline>
              <Button>Понятно</Button>
            </Form>
          </div>
        </Card>
      ) : welcome.open ? (
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 10 }}>
            Как устроен кабинет
          </Heading>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
              Что от вас нужно — в верхней строке «Моих работ» и на карточке работы.
            </li>
            <li style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
              Материалы прикладываются на экране этапа или в «Материалах работы».
            </li>
            <li style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6 }}>
              Менеджеру пишите в переписке на карточке работы.
            </li>
          </ul>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {welcome.telegram ? (
              <Form action={startTelegramBind} inline>
                <Button tone="quiet">Подключить Telegram</Button>
              </Form>
            ) : null}
            <Form action={dismissWelcome} inline>
              <Button>Понятно</Button>
            </Form>
          </div>
        </Card>
      ) : null}

      {showFilters || forHead ? (
        <FilterBar>
          <Tabs
            flush
            label="Отбор работ"
            items={FILTERS.map((key) => ({
              href: href({ state: key }),
              label: tabLabel(key),
              active: key === filter,
            }))}
          />
          {/* Поиск отправляется на свой же маршрут: состояние экрана целиком
              лежит в адресе, и ссылку на отобранный перечень можно
              сохранить или переслать. */}
          <FilterSearch>
            <Form method="get" inline>
              {filter === 'all' ? null : <input type="hidden" name="state" value={filter} />}
              {/* Отбор по менеджеру и куратору — руководителю (РК-03). */}
              {forHead ? (
                <>
                  <Select label="Менеджер" name="manager" labelHidden defaultValue={person.manager} minWidth={180}>
                    <option value="">Все менеджеры</option>
                    {managerList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                  </Select>
                  <Select label="Куратор" name="curator" labelHidden defaultValue={person.curator} minWidth={180}>
                    <option value="">Все кураторы</option>
                    {curatorChoices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.fullName}
                      </option>
                    ))}
                  </Select>
                </>
              ) : null}
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
      {dueKey === null ? null : (
        <Text size={14} style={{ marginBottom: 16 }}>
          {`Отбор: срок работы в ${MONTH_NAMES[Number(dueKey.slice(5)) - 1]} ${dueKey.slice(0, 4)} — `}
          <a className="cab-mark" href={href({}).replace(/([?&])due=[^&]*&?/u, '$1').replace(/[?&]$/u, '')}>
            снять отбор по сроку
          </a>
        </Text>
      )}

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
                    <Heading level={3}>{waitingLine(stage)}</Heading>
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
                    {/* У этапа на согласовании — срок согласования, а не
                        срок этапа: ответ клиента ждут к нему (Т-15, Р-290). */}
                    {stage.state === 'IN_APPROVAL' && stage.approvalDueOn !== null ? (
                      <Chip>срок согласования — до {formatDate(stage.approvalDueOn)}</Chip>
                    ) : stage.dueOn === null ? null : (
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

      {awaitingNda ? <ActionError id={sp.error} /> : null}
      {awaitingNda ? (
        <>
          <Empty title="Доступ к материалам ещё не открыт">
            Он открывается после подписания договора поручения обработки персональных данных.
            Договор оформляет руководитель практики и отмечает его в кабинете.
          </Empty>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', textAlign: 'center' }}>
            {askedAt !== null && !ndaRequestOpen(askedAt, now()) ? (
              <Text size={14}>
                {`Руководитель получил уведомление ${formatDay(askedAt)} в ${formatTime(askedAt)}. Повторно сообщить можно через сутки.`}
              </Text>
            ) : (
              <Form action={requestNdaAction} inline>
                <Button>Сообщить руководителю</Button>
              </Form>
            )}
          </div>
        </>
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
              // Подпись — та же, что на вкладке (решение Р-245).
              filter === 'all' ? '' : `состояние — ${tabLabel(filter).toLowerCase()}`,
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
            // Трек не уже половины ряда: две плашки занимают всю ширину
            // экрана и встают вровень с полосой отбора над ними. Прежний
            // предел ширины перечня в 1136 px оставлял справа пустую
            // полосу, и правый край плашек не совпадал с полем поиска
            // (решение Р-272).
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, max(420px, calc((100% - 16px) / 2))), 1fr))',
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
              // Эксперт в переписку не входит (решение Р-150): счётчик
              // «новых сообщений» звал его туда, куда ему нельзя.
              newMessages === 0 || forExpert
                ? null
                : `${newMessages} ${plural(newMessages, 'новое сообщение', 'новых сообщения', 'новых сообщений')}`,
              forClient ? null : project.client.fullName,
              // Исполнитель на виду у практики (требование М-16, ОМ-23);
              // руководителю — менеджер и куратор ссылками ниже (РК-03).
              forClient || forExpert || forHead ? null : staffExpertLine(project.expert, project.expertNameRaw),
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
                {/* Код работы с экранов убран: он ничего не говорит
                    человеку и сбивает при чтении плашки (замечание
                    заказчика, решение Р-189). В адресе страницы код
                    остаётся — он ключ маршрута. */}
                {/* Тип не дублируется чипом, когда он же стоит заголовком
                    карточки: у всего, что перенесено из книги заказов, это
                    одна и та же строка. */}
                {/* Срок стоял в строке с чипом и при длинном типе
                    сопровождения переносился под него к правому краю —
                    у каждой плашки на своей высоте. Теперь он внизу, над
                    строкой фактов (решение Р-272). */}
                {project.title === project.serviceType.name ? null : (
                  <div style={{ display: 'flex', marginBottom: 8 }}>
                    <Chip tone="accent">{project.serviceType.name}</Chip>
                  </div>
                )}

                {/* Заголовок ведёт внутрь: отдельная строка «Открыть работу»
                    под каждой плашкой стоила у эксперта восемьсот пикселей
                    и вела туда же. */}
                {/* Плашка — раздел перечня, и её заголовок второго уровня:
                    блок «Требует внимания» появляется не всегда, и при его
                    отсутствии третий уровень оказывался сразу после
                    первого — пропуск, который ловит правило облика. */}
                <Heading level={2} size={3} style={{ marginBottom: 4 }}>
                  <a
                    href={`/cabinet/projects/${project.code}`}
                    className="cab-stretch"
                    style={{ color: 'var(--pd-ink)' }}
                  >
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
                {/* Чип «план не заведён» и эта же фраза стояли рядом; у
                    закрытой работы фраза обещала план, которого не будет,
                    а эксперту советовала то, что ему недоступно
                    (решение Р-206). */}
                {/* Закрытая работа без плана молчала вовсе: ни шкалы, ни
                    строки состояния (решение Р-206). */}
                {/* Состояние неактивной работы называется всегда: этапы при
                    закрытии не закрываются (Р-240), и шкала «Ждём ваших
                    материалов» у отменённой работы вводила в заблуждение
                    (решение Р-245). */}
                {project.status !== 'ACTIVE' ? (
                  <Text muted size={13} style={{ margin: '0 0 2px' }}>
                    {project.status === 'COMPLETED'
                      ? 'Работа завершена.'
                      : project.status === 'PAUSED'
                        ? 'Работа приостановлена.'
                        : // Одно слово с меткой состояния и историей (УК-10, Р-366).
                          'Работа отменена.'}
                  </Text>
                ) : null}
                {project.stages.length > 0 || project.status !== 'ACTIVE' ? null : (
                  <Text muted size={13} style={{ margin: '0 0 2px' }}>
                    {forClient || forExpert
                      ? 'План работ ещё составляется: менеджер заведёт этапы и сообщит.'
                      : 'План работ не заведён: этапы задаются на экране работы.'}
                  </Text>
                )}

                {/* Состояние работы называется словом и стоит в плашке:
                    чтобы понять, где работа, открывать её не нужно. */}
                <Progress
                  staff={!forClient}
                  done={done}
                  total={project.stages.length}
                  current={
                    currentStage === null || project.status !== 'ACTIVE'
                      ? null
                      : { title: currentStage.title, state: currentStage.state as StageStateKey }
                  }
                />

                {/* Требуемое действие стоит на самой работе и ведёт прямо
                    на этап: отдельной строкой сверху оно повторяло бы то,
                    что и так видно в шкале (решение Р-175). */}
                {waiting === null ? null : (
                  <Text size={13} style={{ marginTop: 10 }}>
                    {/* Призыв к действию — цель в 44 px, а не строка в
                        девятнадцать (решение Р-253). */}
                    <a className="cab-mark" href={`/cabinet/stages/${waiting.id}`}>
                      {waitingLine(waiting)}
                    </a>
                    {waiting.dueOn === null ? '' : ` — до ${formatDate(waiting.dueOn)}`}
                  </Text>
                )}

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
                            className="cab-mark"
                            style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5 }}
                          >
                            {stage.title}
                          </a>
                          <Text muted size={13} style={{ whiteSpace: 'nowrap' }}>
                            {stageLabel(stage.state as StageStateKey, !forClient)}
                            {stage.dueOn === null ? '' : ` · ${formatDate(stage.dueOn)}`}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                )}
                {/* Строка фактов прижата к низу: в ряду равной высоты
                    она встаёт у всех плашек на одной линии, и ряд
                    читается таблицей, а не лесенкой (решение Р-185). */}
                {/* Пустая строка фактов прежде печаталась неразрывным
                    пробелом ради ровного низа ряда — абзац без текста,
                    который читалка объявляла пустым (решение Р-206). */}
                {/* Срок и строка фактов — один прижатый к низу подвал,
                    последний в плашке: раскрытие «Этапы» стоит над ним, и
                    у плашек ряда подвал встаёт на одни линии, есть план
                    или нет (Р-272). */}
                {facts.length === 0 && project.dueOn === null && !forHead ? (
                  <span aria-hidden="true" style={{ marginTop: 'auto' }} />
                ) : (
                  <div style={{ marginTop: 'auto', paddingTop: 10, display: 'grid', gap: 2 }}>
                    {project.dueOn === null ? null : (
                      <Text
                        muted
                        size={13}
                        style={{ margin: 0, fontFamily: MONO, lineHeight: 1.4 }}
                      >
                        срок — {formatDate(project.dueOn)}
                        {project.status === 'ACTIVE' && daysPast(project.dueOn) !== null
                          ? ' · прошёл'
                          : ''}
                      </Text>
                    )}
                    {facts.length === 0 ? null : (
                      <Text muted size={13} style={{ margin: 0 }}>
                        {facts.join(' · ')}
                      </Text>
                    )}
                    {/* Руководителю — менеджер и куратор ссылками на
                        «Работы» с отбором; ссылки поверх растянутой ссылки
                        плашки (требование РК-03, решение Р-341). */}
                    {!forHead ? null : (
                      <Text muted size={13} style={{ margin: 0 }}>
                        менеджер —{' '}
                        <a
                          className="cab-mark"
                          style={{ position: 'relative', zIndex: 1 }}
                          href={`/cabinet/projects?state=all&manager=${project.managerId}`}
                        >
                          {project.manager.fullName}
                        </a>
                        {' · '}
                        {project.expert === null ? (
                          staffExpertLine(null, project.expertNameRaw)
                        ) : (
                          <>
                            {'куратор — '}
                            <a
                              className="cab-mark"
                              style={{ position: 'relative', zIndex: 1 }}
                              href={`/cabinet/projects?state=all&curator=${project.expertId}`}
                            >
                              {project.expert.fullName}
                            </a>
                            {project.expert.expertProfile?.ndaSignedAt == null ? ' · без договора поручения' : ''}
                          </>
                        )}
                      </Text>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      {/* Постраничность — общей частью (УМ-08, Р-390). */}
      <Pager
        label="Страницы перечня"
        page={list.page}
        pages={list.pages}
        hrefFor={(page) => href({ page })}
        total={`${list.total} ${plural(list.total, 'работа', 'работы', 'работ')}`}
        style={{ marginTop: 24 }}
      />
    </Shell>
  );
}
