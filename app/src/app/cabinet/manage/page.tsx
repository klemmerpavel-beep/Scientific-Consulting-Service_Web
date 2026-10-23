import { redirect } from 'next/navigation';
import { Fragment, type ReactNode } from 'react';
import { waitingPublication } from '../../../lib/cabinet/staff-texts';

import Shell from '../../../components/cabinet/Shell';
import { RADIUS, SANS } from '../../../components/cabinet/tokens';
import { BarChart, RankChart, Sparkline, compactNumber } from '../../../components/cabinet/Charts';
import CardSlider from '../../../components/cabinet/CardSlider';
import {
  Block,
  Board,
  BoardColumn,
  Button,
  ButtonLink,
  Card,
  Chip,
  Disclosure,
  Heading,
  Mono,
  Notice,
  ScreenHead,
  ScrollCard,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  Tabs,
  Text,
  Tile,
  Tiles,
  clip,
  formatDate,
  formatDay,
  plural,
  turnLabel,
  Pager,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { leadSourceLabel } from '../../../lib/cabinet/lead-labels';
import { formatAmount, formatPlain, formatRounded, outstandingOf, workMoneyNote, type OpenTranche } from '../../../lib/cabinet/money';
import type { StageStateKey } from '../../../lib/cabinet/stage-state';
import { staffThreadUnread } from '../../../lib/cabinet/messages';
import { LEAD_STATUS_LABEL } from '../../../lib/cabinet/lead-labels';
import { leadQueue } from '../../../lib/cabinet/queries';
import { attentionParts, attentionSources } from '../../../lib/cabinet/attention';
import { CHECK_TITLE } from '../../../lib/cabinet/head-checks';
import { reactionDays } from '../../../lib/cabinet/practice-settings';
import { notifyChannelsDown } from '../../../lib/cabinet/outbox';
import { daysPast, moscowToday, now as clockNow } from '../../../lib/cabinet/clock';
import { requireActor } from '../../../lib/cabinet/session';
import { homeFor } from '../../../lib/cabinet/nav';
import { byMonth, periodBounds, products, receivedBetween } from '../../../lib/cabinet/analytics/metrics';
import { loadRows } from '../../../lib/cabinet/analytics/data';
import { leadRows } from '../../../lib/cabinet/analytics/leads';
import { PULSE_PERIODS, pulseChange, pulseMetrics, pulsePeriod, pulseWindow } from '../../../lib/cabinet/analytics/pulse';
import { activeWorks, moneyBrief, orderSummary, stageLoad, upcomingDeadlines } from '../../../lib/cabinet/summary';
import { teamBrief, teamLoad } from '../../../lib/cabinet/team';
import { recommendationsNow } from '../../../lib/cabinet/recommendations';
import { practiceReview } from '../../../lib/cabinet/practice-review';
import { DEFAULT_LAYOUT, isShown, visiblePlates, type PlateKey } from '../../../lib/cabinet/summary-layout';
import { summaryLayoutOf } from '../../../lib/cabinet/summary-settings';

export const dynamic = 'force-dynamic';

/**
 * Сколько дней прошло с назначенного срока; до срока — ничего. День
 * берётся у часов кабинета, а не у системных: снимок не должен
 * зависеть от дня съёмки (решение Р-205).
 */
const overdueDays = (dueOn: Date | null): number | null => daysPast(dueOn);

/**
 * Ступень тревоги по величине просрочки.
 *
 * Одного красного мало: на сводке рядом стоят просрочка в день и в год, а
 * выглядели они одинаково. Ступени — неделя, месяц, квартал и дальше;
 * граница проходит там, где меняется существо дела: день опоздания — это
 * рабочая заминка, месяц — сорванный этап, квартал — работа, о которой
 * забыли (решение Р-199).
 */
function alertStep(late: number | null): 0 | 1 | 2 | 3 | 4 {
  if (late === null) return 0;
  if (late <= 7) return 1;
  if (late <= 30) return 2;
  if (late <= 90) return 3;
  return 4;
}


/**
 * Кромка плашки по ступени тревоги. Ноль — кромки нет.
 *
 * Прежде ступень заливала плашку целиком четырьмя оттенками красного —
 * вторая ступень побайтно совпадала с фоном блока ошибки, — и сводка из
 * восьми сорванных сроков читалась одним красным полем: настоящая ошибка
 * формы на таком фоне терялась, а правило «красный — только исход
 * действия» обходилось псевдонимом. Теперь плашка белая, а ступень несёт
 * кромка слева — от серой к графитовой, по той же шкале текста, что и
 * вся система. Число дней стоит меткой над названием: цвет показывает,
 * а читают подпись (решение Р-208).
 */
const ALERT_EDGE: Record<number, string | undefined> = {
  0: undefined,
  1: 'var(--pd-edge-neutral)',
  2: 'var(--pd-ink-muted)',
  3: 'var(--pd-ink-secondary)',
  4: 'var(--pd-ink)',
};

/**
 * Толщина кромки по той же ступени. Третья и четвёртая ступени по тону
 * почти неразличимы (`ink-secondary` и `ink`), поэтому ступень читается
 * ещё и шириной: 3, 4, 5, 6 px (решение Р-212).
 */
const ALERT_WIDTH: Record<number, number> = { 0: 0, 1: 3, 2: 4, 3: 5, 4: 6 };

/**
 * Сколько ближайших сроков стоит в плашке: столько, сколько входит в её
 * единый размер (Р-576); остальные — строкой «И ещё N».
 */
const DEADLINES_SHOWN = 3;


/**
 * Строка чисел в плашке сводки: подпись мелко, число крупнее (Р-574).
 */
const DASH_FIGURES = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
  gap: 12,
} as const;
const DASH_FIGURE_LABEL = { fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)', lineHeight: 1.5 } as const;
const DASH_FIGURE_VALUE = {
  margin: '4px 0 0',
  fontFamily: SANS,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.24,
  color: 'var(--pd-ink)',
  fontVariantNumeric: 'tabular-nums',
} as const;

/**
 * Запись в колонках «Ведутся сейчас» и «Заявки» — отдельной плашкой с
 * рамкой и тихим фоном, с промежутком до соседней. Прежде записи
 * разделяла едва заметная линия, и десяток работ читался сплошным текстом:
 * где кончается одна работа и начинается другая, видно не было (решение
 * Р-490; линия — Р-189).
 */
const BOARD_LIST = { margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 } as const;
const BOARD_ITEM = {
  display: 'grid',
  gap: 6,
  padding: '12px 14px',
  border: '1px solid var(--pd-border)',
  borderRadius: RADIUS.field,
  background: 'var(--pd-surface-quiet)',
  minWidth: 0,
} as const;

/**
 * Остаток по договору работы: сколько ещё не получено.
 *
 * На карточке просрочки это главная величина после самого срока: сорванный
 * этап у работы с закрытым остатком и у работы, где не получено полмиллиона,
 * — две разные беды.
 */
function owed(contract: {
  totalAmount: bigint;
  tranches: readonly OpenTranche[];
} | null): bigint {
  if (contract === null) return 0n;
  // Списанное под угрозой уже не числится (решение Р-240).
  return outstandingOf(contract.totalAmount, contract.tranches);
}

export default async function ManageQueue({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; attention?: string; sent?: string; error?: string; received?: string; period?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage');
  if (!can(actor, 'REQUEST_MODERATE')) redirect(homeFor(actor));

  const requested = Number((await searchParams).page ?? '1');
  // Вопрос руководителю задаётся внизу «Сегодня»: промежуточного экрана
  // «Управление» у менеджера больше нет (требование М-05, решение Р-305).
  // Новые ответы руководителя в ветке менеджера (РК-07, Р-336).
  const headReplies = actor.role === 'MANAGER' ? await staffThreadUnread(actor, actor.id) : 0;
  // Справочник типов сопровождения на сводке больше не нужен: формы
  // одобрения уехали на экран заявки (решение Р-172).
  // Выборки «Требует внимания» — одним набором с утренней сводкой
  // (требование РК-04, решение Р-342): «Мои» дела руководителя по
  // его работам и «Контроль» по остальным (РК-05, Р-337), дела «акт и
  // счёт» (РК-12, Р-338), вопросы сотрудников (РК-07, Р-336).
  const sources = await attentionSources(actor);
  const parts = attentionParts(sources);
  const { light, unread, today, outbox } = sources;
  const term = actor.role === 'HEAD' ? await reactionDays() : 0;
  // «Команда» — лента плашек всех сотрудников (РК-06, Р-343; Р-575).
  const team = actor.role === 'HEAD' ? teamBrief(await teamLoad(actor)) : [];
  // Рекомендации — для группы «Возможность» «Разбора практики»; первой
  // строкой в ней — «Рекомендация месяца» (РК-17, Р-350; К-2, Р-586).
  const advice = actor.role === 'HEAD' && can(actor, 'ANALYTICS_VIEW') ? await recommendationsNow(actor) : null;
  const queue = await leadQueue(actor, Number.isFinite(requested) ? requested : 1);
  const leads = queue.rows;

  // Состояние заказов без денег: заказчик запретил выносить деньги на
  // главную — для них есть свой экран (решение Р-194). Плитки видит тот,
  // кому открыта практика целиком.
  const maySeeMoney = can(actor, 'MARGIN_VIEW');
  const summary = maySeeMoney ? await orderSummary(actor) : null;
  // Деньги коротко — три итога для нижней правой плашки главной. Разбор
  // по работам остаётся на своём экране (решение Р-201).
  const money = maySeeMoney ? await moneyBrief(actor) : null;
  // Перечень действующих работ видят обе служебные роли, и каждая — свои:
  // менеджеру `scopeProjects` оставляет те, где он куратор. Деньги в строке
  // появляются только при праве на маржу (решение Р-175).
  const works = await activeWorks(actor);
  // Срез «по сроку работы» для «Чем занята практика» (Р-576): прошёл, в
  // ближайшие две недели, позже, не назначен. День — московский (Р-257).
  const dueDay = moscowToday(clockNow()).getTime();
  const dueSoon = dueDay + 14 * 86_400_000;
  const dueBands = [
    { key: 'late', label: 'Прошёл', test: (due: number) => due < dueDay },
    { key: 'soon', label: 'В ближайшие две недели', test: (due: number) => due >= dueDay && due < dueSoon },
    { key: 'later', label: 'Позже', test: (due: number) => due >= dueSoon },
  ].map((band) => ({
    key: band.key,
    label: band.label,
    count: works.filter((work) => work.dueOn !== null && band.test(work.dueOn.getTime())).length,
  }));
  dueBands.push({ key: 'none', label: 'Не назначен', count: works.filter((work) => work.dueOn === null).length });
  // Состояние очереди уведомлений видит только руководитель (решение Р-154):
  // менеджеру служебная кухня не нужна, а недоставленное письмо — забота
  // того, кто отвечает за практику целиком.

  // Дашборд собирается только руководителю: деньги практики и её загрузка
  // целиком — его предмет, менеджеру на главной нужны свои дела
  // (решение Р-180). Прокрутка здесь разрешена: витрину в окно не уложить,
  // не отрезав от неё смысл.
  const dashboard = can(actor, 'ANALYTICS_VIEW');
  // Раскладка «Сводки» руководителя — какие плашки и полосы показывать и в
  // каком порядке (К-5, Р-595); у менеджера сетки плашек нет.
  const layout = dashboard ? await summaryLayoutOf(actor) : DEFAULT_LAYOUT;
  const analyticsRows = dashboard ? await loadRows(actor) : [];
  // Ряд доходит до текущего месяца: «последние двенадцать месяцев»
  // кончаются сегодняшним, а не месяцем последнего начала (решение Р-257).
  const months = dashboard ? byMonth(analyticsRows, clockNow()).slice(-12) : [];
  // Что заказывают: типы сопровождения за последние двенадцать месяцев.
  // Плитки говорят, сколько работ, графики — когда они приходят и где
  // стоят; это отвечает, чего именно просят (решение Р-196).
  //
  // Окно то же, что у столбцов слева, — двенадцать календарных месяцев
  // ряда, а не 365 дней от сегодня. Прежде рядом стояли «за двенадцать
  // месяцев 17» и «из 18 заказов»: два окна для одного вопроса. Доля
  // считается от всех заказов окна, а не от суммы шести показанных
  // позиций (решение Р-211).
  const windowStart =
    months.length === 0 ? null : new Date(Date.UTC(months[0]!.year, months[0]!.month - 1, 1));
  const demandAll = dashboard
    ? products(
        analyticsRows.filter(
          (row) => row.startedOn !== null && windowStart !== null && row.startedOn >= windowStart,
        ),
      )
        .slice()
        .sort((a, b) => b.orders - a.orders)
    : [];
  const demand = demandAll.slice(0, 6);
  const demandTotal = demandAll.reduce((acc, item) => acc + item.orders, 0);
  const load = dashboard ? await stageLoad(actor) : null;
  // Поступления по месяцу оплаты — шесть последних месяцев ряда, в тысячах
  // рублей (суммы хранятся в копейках). Та же функция, что «Получено за 90
  // дней» и отчёт за период (Р-236), — по дате поступления (Р-576).
  const cash = months.slice(-6).map((month) => ({
    label: month.label,
    value:
      Number(
        receivedBetween(
          analyticsRows,
          new Date(Date.UTC(month.year, month.month - 1, 1)),
          new Date(Date.UTC(month.year, month.month, 1) - 1),
        ),
      ) / 100_000,
  }));
  // Действующих — сумма по состояниям: тот же набор, что у плитки (Р-342).
  const loadTotal = load === null ? 0 : load.points.reduce((acc, point) => acc + point.count, 0);
  const loadOf = (key: string) => load?.points.find((point) => point.key === key)?.count ?? 0;
  // «Ближайшие сроки» — все этапы действующих работ и срок работы без
  // плана, сорванные сверху (требование РК-04, решение Р-342).
  const deadlines = dashboard ? await upcomingDeadlines(actor) : [];
  // «Получено» — с подписью периода: за 90 дней, как плитки, или за всё
  // время. 90 дней — по дате поступления той же функцией, что отчёт за
  // период (Р-236); за всё время — итог по траншам (Р-201).
  const receivedAll = (await searchParams).received === 'all';
  // «Пульс практики» (план владельца по образцу, К-1, решение Р-585):
  // период переключается ссылкой, без сценария на странице. Деньги в нём —
  // поэтому только тому, кому открыта маржа, как прежние плитки (Р-194).
  const period = pulsePeriod((await searchParams).period);
  const pulseWin = dashboard && maySeeMoney ? pulseWindow(period, moscowToday(clockNow())) : null;
  // Скрытый «Пульс» не считается: выборка заявок ему одному и нужна (К-5).
  const pulse =
    pulseWin === null || !isShown(layout, 'pulse') ? null : pulseMetrics(analyticsRows, await leadRows(actor), pulseWin);
  const periodHref = (key: string) => {
    const query = new URLSearchParams();
    if (key !== '90') query.set('period', key);
    if (receivedAll) query.set('received', 'all');
    return `/cabinet/manage${query.size === 0 ? '' : `?${query.toString()}`}#pulse`;
  };
  // Девяносто московских дней по сегодняшний включительно (решение Р-448).
  const quarter = periodBounds(moscowToday(clockNow()), 90);
  const received =
    money === null
      ? null
      : receivedAll || !dashboard
      ? money.received
      : receivedBetween(analyticsRows, quarter.from, quarter.to);
  // Итоги по тому же ряду, что и столбцы: считать их заново неоткуда.
  const yearOrders = months.reduce((acc, month) => acc + month.orders, 0);
  const monthAverage =
    months.length === 0 ? '0' : (yearOrders / months.length).toFixed(1).replace('.', ',');
  const bestMonth = months.reduce<(typeof months)[number] | null>(
    (best, month) => (best === null || month.orders > best.orders ? month : best),
    null,
  );

  // «Требует внимания» — то, что нельзя оставить как есть: сорванный срок,
  // работа, которая ждёт клиента дольше недели (Р-304), и непрочитанное
  // сообщение. У менеджера это главный экран целиком, у руководителя —
  // раздел под сводкой (решение Р-149).
  // Заголовком записи стоит работа и этап, а вид беды — пометкой рядом:
  // прежде три записи подряд начинались одинаково («Сорван срок этапа»), и
  // отличить их друг от друга можно было только по мелкому тексту ниже
  // (решение Р-182). Следующий шаг назван отдельной строкой: «Сорван срок»
  // без него оставляет решение на угадывание. Просрочка считается днями —
  // дату пришлось бы держать в уме.
  const attention = [
    ...parts.overdue.map((stage: (typeof light.overdue)[number]) => {
      const late = overdueDays(stage.dueOn);
      const rest = maySeeMoney ? owed(stage.project.contract) : 0n;
      return {
        key: `overdue-${stage.id}`,
        kind: 'overdue' as const,
        title: `${stage.title} · ${stage.project.title}`,
        mark: late === null ? 'срок сегодня' : `просрочено ${late} ${plural(late, 'день', 'дня', 'дней')}`,
        urgent: true,
        step: alertStep(late),
        // Чей ход — первое, что нужно знать: своё дело менеджер закрывает
        // сам, чужое требует письма или звонка.
        detail: [
          // Чей ход — той же подписью, что на шкале и экране этапа;
          // руководителю по чужой работе — «за куратором» (Р-206, Р-288).
          // Сданный куратором этап — ход за менеджером (Р-325, Р-648).
          turnLabel(
            stage.state as StageStateKey,
            stage.project.managerId !== actor.id ? 'foreign-head' : 'curator',
            stage.project.expertId !== null || (stage.project.expertNameRaw ?? '').trim() !== '',
            stage.handedOverAt,
          ),
          stage.project.client.fullName,
          rest > 0n ? `не получено ${formatAmount(rest)}` : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
        todo: 'Назначить новый срок или перевести этап',
        href: `/cabinet/stages/${stage.id}`,
      };
    }),
    // Работа, у которой прошёл срок работы, а просроченного этапа нет, —
    // почти вся перенесённая книга: этапов у неё нет. Прежде такие работы
    // на сводку не попадали вовсе (решение Р-216).
    ...parts.late.map((work: (typeof light.lateWorks)[number]) => {
      const late = overdueDays(work.dueOn);
      const rest = maySeeMoney ? owed(work.contract) : 0n;
      return {
        key: `late-${work.id}`,
        kind: 'late' as const,
        title: work.title,
        mark:
          late === null
            ? 'срок работы сегодня'
            : `срок работы прошёл ${late} ${plural(late, 'день', 'дня', 'дней')} назад`,
        urgent: true,
        step: alertStep(late),
        detail: [
          work.status === 'PAUSED' ? 'приостановлена' : null,
          work._count.stages === 0 ? 'план работ не заведён' : null,
          work.client.fullName,
          rest > 0n ? `не получено ${formatAmount(rest)}` : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
        todo:
          work.status === 'PAUSED'
            ? 'Возобновить с новым сроком или закрыть работу'
            : work._count.stages === 0
            ? 'Назначить новый срок, завести план или закрыть работу'
            : 'Назначить новый срок работы или закрыть её',
        href: `/cabinet/projects/${work.code}`,
      };
    }),
    // Этап, уже названный просроченным, второй плашкой «ждёт клиента» не
    // повторяется: одна работа стояла на сводке дважды (решение Р-206).
    ...parts.stalled.map((stage: (typeof light.stalled)[number]) => ({
      key: `stalled-${stage.id}`,
      kind: 'stalled' as const,
      step: 0 as const,
      title: `${stage.title} · ${stage.project.title}`,
      mark:
        stage.awaitingClientSince === null
          ? 'ждёт клиента'
          : `ждёт клиента с ${formatDay(stage.awaitingClientSince)}`,
      urgent: false,
      detail: stage.project.client.fullName,
      todo: 'Напомнить клиенту о материалах',
      // Дело открывает переписку с заготовкой напоминания; отправляет
      // куратор, и письмо практики гасит дело (требование М-21, Р-317, М-06).
      href: `/cabinet/projects/${stage.project.code}/messages?draft=remind#body`,
    })),
    ...parts.returned.map((stage) => ({
      key: `returned-${stage.id}`,
      kind: 'returned' as const,
      step: 0 as const,
      title: `${stage.title} · ${stage.project.title}`,
      mark: `клиент вернул с замечаниями ${formatDay(stage.returnedAt)}`,
      urgent: false,
      detail: stage.project.client.fullName,
      todo: 'Разобрать замечания и отметить «Замечания приняты в работу»',
      href: `/cabinet/stages/${stage.id}`,
    })),
    // Вопрос сотрудника — пока руководитель его не прочитал (РК-07, Р-336).
    ...parts.staff.map((row) => ({
      key: `staff-${row.staffId}`,
      kind: 'unread' as const,
      step: 0 as const,
      title: `Вопрос сотрудника: ${row.fullName}`,
      mark: `${row.unread} ${plural(row.unread, 'новое', 'новых', 'новых')}`,
      urgent: false,
      detail: null,
      todo: 'Прочитать и ответить в кабинете',
      href: `/cabinet/manage/team/${row.staffId}`,
    })),
    ...parts.unread.map((row) => ({
      key: `unread-${row.code}`,
      kind: 'unread' as const,
      step: 0 as const,
      title: row.title,
      mark: `${row.count} ${plural(row.count, 'непрочитанное', 'непрочитанных', 'непрочитанных')}`,
      urgent: false,
      detail: null,
      todo: 'Ответить клиенту',
      href: `/cabinet/projects/${row.code}/messages`,
    })),
    ...parts.comment.map((row) => ({
      key: `comment-${row.stageId ?? row.materialId}`,
      kind: 'comment' as const,
      step: 0 as const,
      title: `${row.stageTitle} · ${row.projectTitle}`,
      mark: `${row.count} ${plural(row.count, 'замечание', 'замечания', 'замечаний')} на модерации`,
      urgent: false,
      detail: row.material,
      todo: 'Опубликовать или отклонить — до этого клиент их не видит',
      // Замечание вне этапа разбирается на «Материалах работы», у своего
      // материала (решение Р-284).
      href:
        row.stageId === null
          ? `/cabinet/projects/${row.projectCode}/materials#material-${row.materialId}`
          : `/cabinet/stages/${row.stageId}`,
    })),
    ...parts.handover.map((row) => ({
      key: `handover-${row.href}`,
      kind: 'handover' as const,
      step: 0 as const,
      title: `${row.stageTitle} · ${row.projectTitle}`,
      mark: 'куратор сдал этап',
      urgent: false,
      detail: `сдан ${formatDay(row.handedOverAt)}`,
      todo: 'Посмотреть материалы и записку куратора: на согласование или вернуть куратору',
      href: row.href,
    })),
    ...parts.accepted.map((row) => ({
      key: `accepted-${row.href}`,
      kind: 'accepted' as const,
      step: 0 as const,
      title: `${row.stageTitle} · ${row.projectTitle}`,
      mark: 'этап принят',
      urgent: false,
      detail: null,
      todo: row.nextTitle === null ? 'Все этапы приняты — завершить работу' : `Запустить следующий этап «${row.nextTitle}»`,
      href: row.href,
    })),
    // Куратор ждёт договор поручения — руководителю (Э-12, Р-331).
    ...parts.ndaWaiting.map((row) => ({
      key: `nda-${row.id}`,
      kind: 'work' as const,
      step: 0 as const,
      title: `Нужен договор поручения: ${row.fullName}`,
      mark: row.requestedAt === null ? 'куратор без договора' : 'куратор ждёт договор',
      urgent: false,
      detail:
        row.requestedAt === null
          ? `назначен на ${row.works} ${plural(row.works, 'работу', 'работы', 'работ')}`
          : `сообщил ${formatDay(row.requestedAt)}`,
      todo: 'Оформить договор поручения и отметить его в «Учётных записях»',
      href: `/cabinet/manage/users#nda-${row.id}`,
    })),
    ...parts.noNda.map((row) => ({
      key: `nonda-${row.code}`,
      kind: 'work' as const,
      step: 0 as const,
      title: row.title,
      mark: 'куратор без доступа',
      urgent: false,
      detail: row.expert,
      todo: 'Без договора поручения куратор не видит материалов: договор отмечает руководитель',
      href: `/cabinet/projects/${row.code}#manage`,
    })),
    ...parts.noPlan.map((row) => ({
      key: `noplan-${row.code}`,
      kind: 'work' as const,
      step: 0 as const,
      title: row.title,
      mark: 'нет плана этапов',
      urgent: false,
      detail: row.client,
      todo: 'Завести план — по шаблону или вручную',
      href: `/cabinet/projects/${row.code}#manage`,
    })),
    ...parts.noExpert.map((row) => ({
      key: `noexpert-${row.code}`,
      kind: 'work' as const,
      step: 0 as const,
      title: row.title,
      mark: 'нет куратора',
      urgent: false,
      detail: row.client,
      todo: 'Назначить куратора',
      href: `/cabinet/projects/${row.code}#manage`,
    })),
    ...parts.lateLeads.map((lead) => ({
      key: `latelead-${lead.id}`,
      kind: 'lead' as const,
      step: 0 as const,
      title: lead.name ?? 'Без имени',
      mark: 'заявка без ответа дольше рабочего дня',
      urgent: false,
      detail: `пришла ${formatDay(lead.createdAt)}`,
      todo: 'Разобрать заявку',
      href: `/cabinet/manage/leads/${lead.id}`,
    })),
    ...parts.reviewLeads.map((lead) => ({
      key: `review-${lead.id}`,
      kind: 'lead' as const,
      step: 0 as const,
      title: lead.name ?? 'Без имени',
      mark: `${(LEAD_STATUS_LABEL[lead.status as keyof typeof LEAD_STATUS_LABEL] ?? lead.status).toLowerCase()} с ${formatDay(lead.since)}`,
      urgent: false,
      detail: null,
      todo: 'Довести разбор до решения',
      href: `/cabinet/manage/leads/${lead.id}`,
    })),
    ...parts.version.map((row) => ({
      key: `version-${row.stageId ?? row.materialId}`,
      kind: 'version' as const,
      step: 0 as const,
      title: `${row.stageTitle} · ${row.projectTitle}`,
      mark: `${row.count} ${plural(row.count, 'версия', 'версии', 'версий')} куратора на публикации`,
      urgent: false,
      detail: row.material,
      todo: 'Опубликовать клиенту или не публиковать — до этого клиент их не видит',
      href:
        row.stageId === null
          ? `/cabinet/projects/${row.projectCode}/materials#material-${row.materialId}`
          : `/cabinet/stages/${row.stageId}`,
    })),
    // Дело — только по отказам доставки: отключённый получателем канал и
    // отсутствие адреса чинить нечего (требование РК-02, решение Р-334).
    // Окончательный отказ сервера закрывает строку после первой попытки
    // (Р-252), поэтому числа попыток в пояснении нет (решение Р-665).
    ...parts.outbox.map((digest) => ({
      key: 'outbox',
      kind: 'outbox' as const,
      step: 0 as const,
      title: 'Очередь уведомлений',
      mark: `не доставлено ${digest.deliveryFailed}`,
      urgent: true,
      detail: 'Письма и сообщения, которые канал не доставил',
      todo: 'Разобрать очередь и отправить заново',
      href: '/cabinet/manage/outbox',
    })),
    // Год срока согласования без производственного календаря (УК-15, Р-394).
    ...parts.calendar.map((gap) => ({
      key: `calendar-${gap.year}`,
      kind: 'calendar' as const,
      step: 0 as const,
      title: `Производственный календарь ${gap.year} года`,
      mark: 'не заполнен',
      urgent: false,
      detail: 'Сроки согласования в этом году считаются без переносов выходных',
      todo: 'Заполнить календарь года в «Справочниках»',
      href: '/cabinet/manage/directory?tab=calendar',
    })),
    ...parts.check.map((check) => ({
      key: `check-${check.id}`,
      kind: 'check' as const,
      step: 0 as const,
      title: check.stage === null ? check.project.title : `${check.stage.title} · ${check.project.title}`,
      mark: check.kind === 'CONTRACT_BY_MANAGER' ? 'проверьте договор' : check.kind === 'ACT_AFTER_REOPEN' ? 'этап возвращён в работу' : 'этап принят',
      urgent: false,
      detail:
        check.kind === 'CONTRACT_BY_MANAGER' && check.project.contract !== null
          ? `${check.project.code}, ${formatAmount(check.project.contract.totalAmount)}`
          : null,
      todo: CHECK_TITLE[check.kind],
      href: `/cabinet/projects/${check.project.code}/payments`,
    })),
    // Поручения руководителя: исполнителю — свои открытые, руководителю —
    // просроченные (требование РК-19, решение Р-352).
    ...parts.assignment.map((row) => {
      const late = overdueDays(row.dueOn);
      return {
        key: `assignment-${row.id}`,
        kind: 'assignment' as const,
        step: alertStep(late),
        title: clip(row.text, 80),
        mark: late === null ? `поручение до ${formatDate(row.dueOn)}` : `поручение просрочено на ${late} ${plural(late, 'день', 'дня', 'дней')}`,
        urgent: late !== null,
        detail: row.project === null ? null : (row.project.title ?? row.project.code),
        todo: 'Отметить «в работе» или «сделано»',
        href: '/cabinet/assignments',
      };
    }),
    ...parts.assignmentOverdue.map((row) => {
      const late = overdueDays(row.dueOn);
      return {
        key: `assignment-late-${row.id}`,
        kind: 'assignment' as const,
        step: alertStep(late),
        title: `Поручение просрочено: ${row.assignee.fullName}`,
        mark: late === null ? 'срок сегодня' : `просрочено на ${late} ${plural(late, 'день', 'дня', 'дней')}`,
        urgent: true,
        detail: clip(row.text, 80),
        todo: 'Узнать у сотрудника, перенести срок или отозвать поручение',
        href: '/cabinet/manage/assignments',
      };
    }),
    // «Контроль» — дело менеджера, не закрытое за срок реакции (РК-05).
    ...parts.control.map((row) => ({
      key: row.key,
      kind: 'control' as const,
      step: 0 as const,
      title: row.title,
      mark: `${row.manager === null ? 'заявка' : row.manager} · ждёт ${row.waitDays} ${plural(row.waitDays, 'день', 'дня', 'дней')}`,
      urgent: false,
      detail: null,
      todo: row.todo,
      href: row.href,
    })),
  ];

  // На сводке — не весь перечень, а первые дела каждого вида: при сотнях
  // сорванных сроков главная вытягивалась в десятки тысяч пикселей, а
  // непрочитанное сообщение клиента, стоящее в конце, пропадало под ними.
  // Остальное — по ссылке «Показать все» (решение Р-257).
  const ATTENTION_LIMIT: Record<(typeof attention)[number]['kind'], number> = {
    overdue: 4,
    late: 2,
    returned: 3,
    stalled: 2,
    unread: 3,
    comment: 3,
    version: 3,
    accepted: 3,
    handover: 3,
    work: 3,
    lead: 3,
    outbox: 1,
    control: 6,
    check: 3,
    assignment: 4,
    calendar: 2,
  };
  const showAll = (await searchParams).attention === 'all' || attention.length <= 12;
  const taken: Partial<Record<(typeof attention)[number]['kind'], number>> = {};
  const shownAttention = showAll
    ? attention
    : attention.filter((row) => {
        taken[row.kind] = (taken[row.kind] ?? 0) + 1;
        return taken[row.kind]! <= ATTENTION_LIMIT[row.kind];
      });

  // Ответ сводки одной фразой: сколько дел требуют решения и с чего
  // начать. Прежде его собирали глазами из плашек ниже (решение Р-207).
  // Сорванные сроки — этапов и работ без просроченного этапа; старший
  // срок — самый давний из тех и других (решение Р-216).
  const lateCount = light.overdue.length + light.lateWorks.length;
  const oldest =
    [
      ...light.overdue.map((stage: (typeof light.overdue)[number]) => ({ title: stage.title, dueOn: stage.dueOn })),
      ...light.lateWorks.map((work: (typeof light.lateWorks)[number]) => ({ title: work.title, dueOn: work.dueOn })),
    ]
      .filter((row) => row.dueOn !== null)
      .sort((a, b) => a.dueOn!.getTime() - b.dueOn!.getTime())[0] ?? null;
  const oldestLate = oldest === null ? null : overdueDays(oldest.dueOn);
  const answer = {
    lead:
      attention.length === 0
        ? 'Сегодня ничего не горит.'
        : `${attention.length} ${plural(attention.length, 'дело требует', 'дела требуют', 'дел требуют')} решения.`,
    detail:
      [
        // «Этапов и работ»: число складывает сорванные этапы и работы без
        // сорванного этапа, и без уточнения его сверяли с «Работ с прошедшим
        // сроком» отчёта — другой величиной (решение Р-257).
        lateCount === 0
          ? null
          : `Сорвано сроков этапов и работ — ${lateCount}; старший — «${clip(oldest?.title ?? '', 48)}»${
              oldestLate === null ? '' : `, ${oldestLate} ${plural(oldestLate, 'день', 'дня', 'дней')}`
            }.`,
        summary === null ? null : `Действующих работ — ${summary.active + summary.paused}.`,
        // Всё, что ждёт публикации, — одной строкой по видам (улучшение
        // УЭ-04, решение Р-382); сами дела — ниже, по этапам.
        waitingPublication(
          parts.comment.reduce((acc, row) => acc + row.count, 0),
          parts.version.reduce((acc, row) => acc + row.count, 0),
        ),
        queue.total === 0
          ? null
          : `${queue.total} ${plural(queue.total, 'заявка ждёт', 'заявки ждут', 'заявок ждут')} разбора.`,
      ]
        .filter((part) => part !== null)
        .join(' ') || null,
    action:
      attention.length === 0 ? undefined : (
        <ButtonLink href={attention[0]!.href}>Начать с главного</ButtonLink>
      ),
  };

  // «Разбор практики» — руководителю с аналитикой (К-2, Р-586): дела
  // блока «Требует внимания», сроки недели и рекомендации тремя группами.
  const review =
    advice === null
      ? null
      : practiceReview({
          act: attention.map((row) => ({ title: row.title, note: row.mark, href: row.href })),
          watch: today.week.map((row) => ({
            title: row.title,
            note: `до ${formatDate(row.dueOn)}${row.turn === null ? '' : ` · ${row.turn}`}`,
            href: row.href,
          })),
          chance: { count: advice.unmarked, month: advice.month },
        });

  // Плашки «Требует внимания» — одна разметка для «Моих» и «Контроля».
  const attentionList = (rows: typeof shownAttention) => (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'grid',
        // Не более двух плашек в ряду — общее правило облика.
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px,100%),1fr))',
        gap: 12,
      }}
    >
      {rows.map((row) => (
        <Card
          as="li"
          key={row.key}
          link
          style={{
            position: 'relative',
            padding: row.step > 0 ? '14px 16px 16px 24px' : '14px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            ...(row.urgent && row.step === 0 ? { borderColor: 'var(--pd-accent-edge)' } : {}),
          }}
        >
          {/* Ступень тревоги — кромкой слева, от серой к графитовой;
              плашка остаётся белой (решение Р-208). */}
          {row.step === 0 ? null : (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 10,
                top: 14,
                bottom: 14,
                width: ALERT_WIDTH[row.step],
                borderRadius: RADIUS.pill,
                background: ALERT_EDGE[row.step],
              }}
            />
          )}
          {/* Вид беды — моноширинной меткой над названием, как метки
              разделов на страницах сайта; пилюля на цветном фоне
              спорила с заливкой и дублировала её (решение Р-208). */}
          <Mono style={row.urgent ? { color: 'var(--pd-ink)', fontWeight: 500 } : undefined}>
            {row.mark}
          </Mono>
          {/* Ссылка растянута на всю плашку: подсвечивается плашка
              целиком, и нажиматься должна она же, а не строка в
              шестнадцать пикселей (решение Р-209). */}
          <a
            href={row.href}
            className="cab-stretch"
            style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}
          >
            {row.title}
          </a>
          {row.detail === null ? null : (
            <Text muted size={13}>
              {row.detail}
            </Text>
          )}
          <Text size={13} style={{ marginTop: 'auto', paddingTop: 4 }}>
            {row.todo}
          </Text>
        </Card>
      ))}
    </ul>
  );

  // Перечни «Ведутся сейчас» и «Заявки» — одни для сетки плашек
  // руководителя и колонок менеджера (Р-576).
  const worksList = (
    <>
      {works.length === 0 ? (
        <Text muted>Действующих работ нет.</Text>
      ) : (
        <>
        {works.some((work) => work.paused) ? (
          <Text muted size={13} style={{ marginBottom: 10 }}>
            из них приостановлено {works.filter((work) => work.paused).length}
          </Text>
        ) : null}
        <ul style={BOARD_LIST}>
          {works.map((work) => {
            const late = overdueDays(work.dueOn);
            return (
              // Каждая работа — своей плашкой (решение Р-490).
              <li key={work.code} style={BOARD_ITEM}>
                <a
                  href={`/cabinet/projects/${work.code}`}
                  className="cab-mark"
                  style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}
                >
                  {work.title}
                </a>
                <Text muted size={13}>
                  {work.client}
                  {work.stage === null ? '' : ` · ${work.stage}`}
                  {work.paused ? ' · приостановлена' : ''}
                </Text>
                {/* Кто ведёт работу — руководителю, ссылкой на «Работы»
                    с отбором (требование РК-03, решение Р-341). */}
                {actor.role !== 'HEAD' ? null : (
                  <Text muted size={13}>
                    менеджер —{' '}
                    <a className="cab-mark" href={`/cabinet/projects?state=all&manager=${work.manager.id}`}>
                      {work.manager.fullName}
                    </a>
                    {work.expert === null ? null : (
                      <>
                        {' · куратор — '}
                        <a className="cab-mark" href={`/cabinet/projects?state=all&curator=${work.expert.id}`}>
                          {work.expert.fullName}
                        </a>
                      </>
                    )}
                  </Text>
                )}
                {/* Срок работы — строкой, без пилюли «просрочено N
                    дней»: число считалось от срока работы, а рядом
                    стояло название этапа, и та же работа выше, в
                    «Требует внимания», несла другое число — от срока
                    этапа (решение Р-206). */}
                <Text muted size={13}>
                  {work.dueOn === null
                    ? 'срок не назначен'
                    : `срок работы — ${formatDate(work.dueOn)}${late === null ? '' : ' · прошёл'}`}
                </Text>
                {/* Работа без договора — «договор не заведён», а не
                    «0 ₽ · оплачено полностью»; закрытый списанием
                    остаток назван списанием (решение Р-257). */}
                {work.contracted === null ? null : (
                  <Text muted size={13}>
                    {workMoneyNote(
                      work.hasContract
                        ? {
                            contracted: work.contracted,
                            outstanding: work.outstanding ?? 0n,
                            writtenOff: work.writtenOff ?? 0n,
                          }
                        : null,
                    )}
                  </Text>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </>
  );
  const leadsList = (
    <>
      {leads.length === 0 ? (
        <Text muted>Новых заявок нет.</Text>
      ) : (
        <ul style={BOARD_LIST}>
          {/* Контакт стоит в строке, а разбор начинается кнопкой:
              прежде за тем и другим приходилось заходить внутрь, а
              менеджер решает по заявке за секунды (решение Р-180).
              Каждая заявка — своей плашкой (решение Р-490). */}
          {leads.map((lead) => (
            <li key={lead.id} style={{ ...BOARD_ITEM, gap: 4 }}>
              <a
                href={`/cabinet/manage/leads/${lead.id}`}
                className="cab-mark"
                style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}
              >
                {lead.name ?? 'Без имени'}
              </a>
              <Text muted size={13}>
                {leadSourceLabel(lead.source)} · {formatDay(lead.createdAt)}
                {lead.topic === null ? '' : ` · ${lead.topic}`}
              </Text>
              <Text size={13}>{lead.contact}</Text>
              <div style={{ marginTop: 4 }}>
                <ButtonLink href={`/cabinet/manage/leads/${lead.id}`}>Разобрать</ButtonLink>
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* Очередь листается: прежде видна была только первая страница
          (требование М-06, решение Р-304). */}
      {/* Постраничность — общей частью (УМ-08, Р-390). */}
      <Pager
        label="Страницы очереди заявок"
        page={queue.page}
        pages={queue.pages}
        hrefFor={(page) => `/cabinet/manage?page=${page}`}
        textSize={13}
        style={{ gap: 16, marginTop: 12 }}
      />
    </>
  );

  // Плашки сетки «Сводки» по ключам раскладки (К-5, Р-595): руководитель
  // выбирает, какие показывать и в каком порядке. Разметка плашек прежняя;
  // порядок по умолчанию — порядок Р-576.
  const plates: Record<PlateKey, ReactNode> | null =
    load === null
      ? null
      : {
    team: (
      <>
        {/* «Команда» — лента плашек: у каждого сотрудника своя плашка, её
            листают кнопками, прокруткой и стрелками и выбирают нужного
            человека (замечание владельца 13.10.2026, решение Р-575). В
            плашке — работ, просрочено, ждёт его решения и где стоят его
            работы; первыми — у кого больше просроченного и ждущего
            (требование РК-06, решение Р-343). */}
        {actor.role !== 'HEAD' ? null : (
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <Heading level={2} size={3} style={{ marginBottom: 10 }}>
              {team.length === 0 ? 'Команда' : `Команда · ${team.length}`}
            </Heading>
            {/* Пустая команда — только фраза, без пустой ленты: читалка
                объявляла «список, 0 пунктов» (решение Р-541). */}
            {team.length === 0 ? (
              <Text muted size={14}>
                В команде пока нет сотрудников.
              </Text>
            ) : (
              <CardSlider label="Сотрудники практики" compact>
                {team.map((row) => (
                  <Card as="article" link key={`${row.side}-${row.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {/* Ссылка растянута на плашку: нажимается плашка
                          целиком (решения Р-209, Р-253). Ведёт в «Работы» с
                          отбором по человеку (РК-03). */}
                      <Heading level={3} size={3}>
                        <a className="cab-stretch" href={row.href}>
                          {row.fullName}
                        </a>
                      </Heading>
                      <span>
                        <Chip>{row.side}</Chip>
                      </span>
                    </div>
                    {/* Числа — строками «подпись — число»: в узкой плашке
                        три столбца рвали подписи посреди слова. */}
                    <dl style={{ display: 'grid', gap: 4, margin: 0 }}>
                      {[
                        { key: 'works', label: 'Работ', value: row.works },
                        { key: 'late', label: 'Просрочено', value: row.overdue },
                        { key: 'decide', label: 'Ждёт решения', value: row.decide },
                      ].map((figure) => (
                        <div key={figure.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                          <dt style={DASH_FIGURE_LABEL}>{figure.label}</dt>
                          <dd style={{ ...DASH_FIGURE_VALUE, margin: 0 }}>{figure.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <Text muted size={13}>
                      {row.points.length === 0
                        ? 'Действующих работ нет.'
                        : row.points.map((point) => `${point.label.toLowerCase()} ${point.count}`).join(' · ')}
                    </Text>
                  </Card>
                ))}
              </CardSlider>
            )}
            {/* Новый человек — отдельной кнопкой, сразу в форму заведения
                с ролью и исходными данными (решение Р-488). */}
            <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ButtonLink href="/cabinet/manage/team" tone="quiet">
                Вся команда
              </ButtonLink>
              <ButtonLink href="/cabinet/manage/users?new=1#new" tone="quiet">
                Добавить в команду
              </ButtonLink>
            </div>
          </Card>
        )}
      </>
    ),
    load: (
      <>
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Чем занята практика
          </Heading>
          {/* Сначала — четыре числа действующих работ, ниже — где они
              стоят по текущему этапу. Пояснительный абзац и пилюля
              просрочки сняты: то же самое говорят числа (замечание
              владельца 13.10.2026, решение Р-574). Набор действующих —
              тот же, что у плиток (РК-04, Р-342). */}
          <dl style={{ ...DASH_FIGURES, margin: '0 0 16px', paddingBottom: 14, borderBottom: '1px solid var(--pd-divider)' }}>
            {[
              { key: 'live', label: 'Действующих', value: loadTotal },
              { key: 'work', label: 'Этап в работе', value: loadOf('IN_PROGRESS') },
              { key: 'pause', label: 'Приостановлено', value: load.paused },
              { key: 'plan', label: 'Без плана', value: load.planless },
            ].map((row) => (
              <div key={row.key}>
                <dt style={DASH_FIGURE_LABEL}>{row.label}</dt>
                <dd style={DASH_FIGURE_VALUE}>{row.value}</dd>
              </div>
            ))}
          </dl>
          {load.points.length === 0 ? (
            <Text muted>Действующих работ нет.</Text>
          ) : (
            <>
              <Text muted size={13} style={{ marginBottom: 6 }}>
                По текущему этапу
              </Text>
              <RankChart
                title="Работы по состоянию текущего этапа"
                width={460}
                labelWidth={200}
                data={load.points.map((point) => ({ label: point.label, value: point.count }))}
                format={(value) => String(Math.round(value))}
              />
              {/* Второй срез — по сроку работы: сколько сорвано, сколько
                  подходит, сколько впереди (Р-576). */}
              <Text muted size={13} style={{ margin: '14px 0 6px' }}>
                По сроку работы
              </Text>
              <RankChart
                title="Действующие работы по сроку работы"
                width={460}
                labelWidth={200}
                data={dueBands.map((band) => ({ label: band.label, value: band.count }))}
                format={(value) => String(Math.round(value))}
              />
            </>
          )}
          {/* Числа стоят и текстом: график объявлен картинкой, и читалка
              получает от него одно название (правило Р-176). */}
          <div style={{ marginTop: 'auto' }} />
          {load.points.length === 0 ? null : (
            <Disclosure title="Числа" style={{ marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TABLE_HEAD} scope="col">Срез</th>
                    <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Работ</th>
                    <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Доля</th>
                  </tr>
                </thead>
                <tbody>
                  {load.points.map((point) => (
                    <tr key={point.key}>
                      <td style={TABLE_CELL}>{point.label}</td>
                      <td style={TABLE_NUM}>{point.count}</td>
                      <td style={TABLE_NUM}>{loadTotal === 0 ? '—' : `${Math.round((point.count / loadTotal) * 100)} %`}</td>
                        </tr>
                      ))}
                      {dueBands.map((band) => (
                        <tr key={band.key}>
                          <td style={TABLE_CELL}>{`Срок работы: ${band.label.toLowerCase()}`}</td>
                          <td style={TABLE_NUM}>{band.count}</td>
                          <td style={TABLE_NUM}>{works.length === 0 ? '—' : `${Math.round((band.count / works.length) * 100)} %`}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </Disclosure>
          )}
        </Card>
      </>
    ),
    months: (
      <>
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Заказы по месяцам
          </Heading>
          {/* Без заказов — фраза, а не пустые оси: график из нулей
              читался как сбой, а не как затишье (решение Р-257). */}
          {yearOrders === 0 ? (
            <Text muted>Заказов за двенадцать месяцев нет.</Text>
          ) : (
            <BarChart
              title="Принято заказов по месяцам"
              width={460}
              height={220}
              unit="работ"
              data={months.map((month) => ({ label: month.label, value: month.orders }))}
              format={(value) => String(Math.round(value))}
            />
          )}
          <Text muted size={13} style={{ marginTop: 10 }}>
            По месяцу начала работы, последние двенадцать месяцев, включая текущий.
          </Text>
          {yearOrders === 0 ? null : (
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                gap: 12,
                margin: '16px 0 0',
                paddingTop: 14,
                borderTop: '1px solid var(--pd-divider)',
              }}
            >
              {[
                { key: 'sum', label: 'За двенадцать месяцев', value: String(yearOrders) },
                { key: 'avg', label: 'В среднем в месяц', value: monthAverage },
                {
                  key: 'best',
                  label: 'Самый плотный месяц',
                  value: bestMonth === null ? '—' : bestMonth.label,
                },
              ].map((row) => (
                <div key={row.key}>
                  <dt style={{ fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)', lineHeight: 1.5 }}>
                    {row.label}
                  </dt>
                  <dd
                    style={{
                      margin: '4px 0 0',
                      fontFamily: SANS,
                      fontSize: 16,
                      fontWeight: 600,
                      lineHeight: 1.24,
                      color: 'var(--pd-ink)',
                    }}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div style={{ marginTop: 'auto' }} />
          {yearOrders === 0 ? null : (
            <Disclosure title="Числа" style={{ marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TABLE_HEAD} scope="col">Месяц</th>
                    <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Заказов</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.key}>
                      <td style={TABLE_CELL}>{month.label}</td>
                      <td style={TABLE_NUM}>{month.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Disclosure>
          )}
        </Card>
      </>
    ),
    demand: (
      <>
        {/* «Что заказывают» — с той же строкой чисел, что у соседних
            плашек: в плашке единого размера график из шести строк
            оставлял её наполовину пустой (Р-489, Р-576). */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Что заказывают
          </Heading>
          {demand.length === 0 ? (
            <Text muted>Заказов за двенадцать месяцев нет.</Text>
          ) : (
            <>
              <RankChart
                title="Заказы по типам сопровождения за год"
                width={460}
                labelWidth={200}
                data={demand.map((item) => ({ label: item.typeName, value: item.orders }))}
                format={(value) => String(Math.round(value))}
              />
              <Text muted size={13} style={{ marginTop: 10 }}>
                Те же двенадцать месяцев, что у «Заказов по месяцам», по дате начала работы.
              </Text>
              <dl style={{ ...DASH_FIGURES, margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid var(--pd-divider)' }}>
                {[
                  { key: 'sum', label: 'Заказов', value: String(demandTotal) },
                  { key: 'types', label: 'Типов сопровождения', value: String(demandAll.length) },
                  {
                    key: 'lead',
                    label: 'Ведущий тип',
                    value: demandTotal === 0 ? '—' : `${Math.round((demand[0]!.orders / demandTotal) * 100)} %`,
                  },
                ].map((row) => (
                  <div key={row.key}>
                    <dt style={DASH_FIGURE_LABEL}>{row.label}</dt>
                    <dd style={DASH_FIGURE_VALUE}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div style={{ marginTop: 'auto' }} />
              <Disclosure title="Числа" style={{ marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TABLE_HEAD} scope="col">Тип сопровождения</th>
                      <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Заказов</th>
                      <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Доля</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demandAll.map((item) => (
                      <tr key={item.typeCode}>
                        <td style={TABLE_CELL}>{item.typeName}</td>
                        <td style={TABLE_NUM}>{item.orders}</td>
                        <td style={TABLE_NUM}>
                          {demandTotal === 0 ? '—' : `${Math.round((item.orders / demandTotal) * 100)} %`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Disclosure>
            </>
          )}
        </Card>
      </>
    ),
    deadlines: (
      <>
        {/* «Ближайшие сроки» и «Деньги» — две плашки: вместе они были
            вдвое выше соседних (Р-576). Этапы действующих работ и срок
            работы без плана — в окне двух недель и сорванные; у строки —
            чей ход, менеджер, куратор, пометка приостановленной (РК-04,
            Р-342). */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Ближайшие сроки
          </Heading>
          {deadlines.length === 0 ? (
            <Text muted size={14}>
              В ближайшие две недели сроков нет, сорванных сроков нет.
            </Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {deadlines.slice(0, DEADLINES_SHOWN).map((row) => (
                <li key={row.key} style={{ display: 'grid', gap: 2 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0,1fr) auto',
                      gap: 12,
                      alignItems: 'baseline',
                    }}
                  >
                    <a
                      href={row.href}
                      className="cab-mark"
                      style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5 }}
                    >
                      {row.stage === null ? row.title : `${row.stage} · ${row.title}`}
                    </a>
                    <Text muted size={13} style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(row.dueOn)}
                    </Text>
                  </div>
                  <Text muted size={13}>
                    {[
                      row.late === null
                        ? null
                        : `просрочено ${row.late} ${plural(row.late, 'день', 'дня', 'дней')}`,
                      row.stage === null ? 'срок работы, плана нет' : row.turn,
                      `менеджер — ${row.manager}`,
                      row.curator === null ? null : `куратор — ${row.curator}`,
                      row.paused ? 'приостановлена' : null,
                    ]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </Text>
                </li>
              ))}
            </ul>
          )}
          {deadlines.length <= DEADLINES_SHOWN ? null : (
            <Text muted size={13} style={{ marginTop: 10 }}>
              И ещё {deadlines.length - DEADLINES_SHOWN}{' '}
              {plural(deadlines.length - DEADLINES_SHOWN, 'срок', 'срока', 'сроков')} в том же окне.
            </Text>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <ButtonLink href="/cabinet/projects" tone="quiet">
              Все работы
            </ButtonLink>
          </div>
        </Card>
      </>
    ),
    money: (
      <>
        {money === null ? null : (
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <Heading level={2} size={3} style={{ marginBottom: 12 }}>
              Деньги
            </Heading>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                  gap: 12,
                  margin: 0,
                  paddingBottom: 14,
                  borderBottom: '1px solid var(--pd-divider)',
                }}
              >
                {[
                  {
                    key: 'got',
                    label: receivedAll || !dashboard ? 'Получено за всё время' : 'Получено за 90 дней',
                    value: formatPlain(received ?? money.received),
                  },
                  { key: 'wait', label: 'К получению', value: formatPlain(money.awaiting) },
                  // Платежи со сроком раньше сегодняшнего дня. Не «остаток по
                  // работам с прошедшим сроком» отчёта и аналитики — там мера
                  // другая, и одно слово на двух экранах читалось как
                  // расхождение (решение Р-257).
                  {
                    key: 'debt',
                    label: 'Просрочено по траншам',
                    value: formatPlain(money.overdue),
                  },
                ].map((row) => (
                  <div key={row.key}>
                    <dt
                      style={{
                        fontFamily: SANS,
                        fontSize: 13,
                        color: 'var(--pd-ink-muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      {row.label}
                    </dt>
                    <dd
                      style={{
                        margin: '4px 0 0',
                        fontFamily: SANS,
                        fontSize: 16,
                        fontWeight: 600,
                        lineHeight: 1.24,
                        color: 'var(--pd-ink)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {row.key === 'debt' && money.overdue > 0n ? (
                        <a className="cab-mark" href="/cabinet/manage/finance/debtors">
                          {row.value}
                        </a>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            {/* Поступления по месяцу оплаты — шесть последних месяцев: по
                ним видно, ровно ли идут деньги (Р-576). Не «оплаты по
                месяцу начала работы» экрана денег: здесь — когда деньги
                пришли. */}
            {cash.every((month) => month.value === 0) ? (
              <Text muted size={13} style={{ marginTop: 12 }}>
                За шесть месяцев поступлений нет.
              </Text>
            ) : (
              <div style={{ marginTop: 12 }}>
                <BarChart
                  title="Поступления по месяцу оплаты"
                  width={460}
                  height={150}
                  unit="тыс ₽"
                  data={cash}
                  format={(value) => String(Math.round(value))}
                />
              </div>
            )}
              {/* Переключатель периода «Получено» (РК-04, Р-342). */}
              {!dashboard ? null : (
                <Text muted size={13} style={{ marginTop: 10 }}>
                  Получено:{' '}
                  <a
                    className="cab-mark"
                    href="/cabinet/manage?received=90"
                    aria-current={receivedAll ? undefined : 'true'}
                  >
                    за 90 дней
                  </a>
                  {' · '}
                  <a
                    className="cab-mark"
                    href="/cabinet/manage?received=all"
                    aria-current={receivedAll ? 'true' : undefined}
                  >
                    за всё время
                  </a>
                </Text>
              )}
            {/* Числа стоят и текстом: график объявлен картинкой (Р-176).
                Суммы — в рублях; остаток по работам — на экране денег,
                просроченные платежи — в «Должниках» по ссылке у числа (РК-10,
                Р-345). */}
            <Disclosure title="Числа" style={{ marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={TABLE_HEAD} scope="col">Месяц оплаты</th>
                    <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Поступило, тыс ₽</th>
                  </tr>
                </thead>
                <tbody>
                  {cash.map((month) => (
                    <tr key={month.label}>
                      <td style={TABLE_CELL}>{month.label}</td>
                      <td style={TABLE_NUM}>{String(Math.round(month.value))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Disclosure>
            <div style={{ marginTop: 'auto', paddingTop: 12 }}>
              <ButtonLink href="/cabinet/manage/finance">Деньги и расчёты</ButtonLink>
            </div>
          </Card>
        )}
      </>
    ),
    works: (
      <>
          <ScrollCard title={`${summary === null ? 'Мои работы' : 'Ведутся сейчас'} · ${works.length}`} href="/cabinet/projects" hrefLabel="все работы">
            {worksList}
          </ScrollCard>
      </>
    ),
    leads: (
      <>
          <ScrollCard
            title={queue.total === 0 ? 'Заявки' : `Заявки · ${queue.total}`}
            href={queue.total > 0 ? '/cabinet/manage/leads' : undefined}
            hrefLabel="все обращения"
          >
            {leadsList}
          </ScrollCard>
      </>
    ),
        };
  const shownPlates = visiblePlates(layout);

  return (
    <Shell actor={actor} current="/cabinet/manage" board>
      {/* Сводка — первый экран после входа обеих служебных ролей, и она
          показывает всё главное сразу: что нельзя оставить как есть, что
          в работе и что ждёт разбора. Прежде заголовок первого уровня
          плавал — у руководителя «Практика», у менеджера «Требует
          внимания», — и один блок был набран двумя способами
          (решение Р-172). */}
      {/* Кнопка отчёта стоит справа вверху — там, где заказчик её просил:
          общее действие страницы, а не карточка среди карточек
          (решение Р-201). Менеджеру аналитика закрыта, и кнопки у него
          нет вовсе. */}
      <ScreenHead
        // Заголовок руководителя — как пункт меню (требование РК-14, Р-340).
        title={summary === null ? 'Работа на сегодня' : 'Сводка'}
        answer={answer}
        action={
          dashboard ? (
            <>
              {/* «Настроить» — какие плашки «Сводки» показывать и в каком
                  порядке (К-5, Р-595). */}
              <ButtonLink href="/cabinet/manage/layout">Настроить</ButtonLink>
              <ButtonLink href="/cabinet/manage/report">Отчёт за период</ButtonLink>
            </>
          ) : undefined
        }
      />

      {/* «Разбор практики» — три группы с числом и главной строкой: что
          сделать, за чем наблюдать, какая есть возможность (К-2, Р-586).
          Заменил строку «Рекомендация месяца»: она — первая строка группы
          «Возможность». Перечни остаются ниже и на «Рекомендациях». */}
      {review === null || !isShown(layout, 'review') ? null : (
        <section id="review" aria-label="Разбор практики" style={{ scrollMarginTop: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 14 }}>
            Разбор практики
          </Heading>
          <Tiles>
            {review.map((group) => (
              <Tile key={group.key} label={group.label} value={String(group.count)} note={group.scope}>
                {group.first === null ? (
                  <Text muted size={13} style={{ marginTop: 12 }}>
                    {group.empty}
                  </Text>
                ) : (
                  <div style={{ marginTop: 12, display: 'grid', gap: 2 }}>
                    <a href={group.first.href} className="cab-mark" style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>
                      {clip(group.first.title, 90)}
                    </a>
                    {group.first.note === null ? null : (
                      <Text muted size={13}>
                        {group.first.note}
                      </Text>
                    )}
                  </div>
                )}
                {group.all === null ? null : (
                  <a href={group.all.href} className="cab-mark" style={{ display: 'inline-block', marginTop: 10, fontFamily: SANS, fontSize: 13 }}>
                    {group.all.label}
                  </a>
                )}
              </Tile>
            ))}
          </Tiles>
        </section>
      )}

      {/* Ни почта, ни бот не настроены — уведомления копятся в очереди;
          плашка стоит, пока не настроен хотя бы один канал (требование
          РК-02, решение Р-334). */}
      {outbox !== null && notifyChannelsDown() ? (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="quiet" role="alert">
            Уведомления не уходят: настройте почту. Пока не настроены ни почта, ни бот Telegram, письма и
            сигналы копятся в очереди.
          </Notice>
        </div>
      ) : null}

      {/* «Требует внимания» — верхней полосой отдельными плашками, а не
          колонкой: заказчик смотрит сводку сверху вниз, и то, что нельзя
          оставить как есть, должно встречать первым. Каждая запись —
          своя плашка с переходом на задачу (решение Р-189). У
          руководителя полоса стояла под плитками и графиками, на втором
          экране прокрутки, — вопреки тому же решению; теперь она сразу
          под ответом, а витрина практики ниже (решение Р-210). */}
      {attention.length === 0 ? null : (
        <Block id="attention" style={{ marginBottom: 20 }}>
          <Heading level={2} style={{ marginBottom: 12 }}>
            Требует внимания · {attention.length}
          </Heading>
          {actor.role === 'HEAD' ? (
            <>
              {/* «Мои» и «Контроль» разделены (требование РК-05, решение
                  Р-337): свои дела руководителя — как у менеджера; чужие —
                  только после срока реакции. */}
              <Heading level={3} size={3} style={{ marginBottom: 10 }}>
                Мои · {shownAttention.filter((row) => row.kind !== 'control').length}
              </Heading>
              {attentionList(shownAttention.filter((row) => row.kind !== 'control'))}
              {parts.control.length === 0 ? null : (
                <>
                  <Heading level={3} size={3} style={{ margin: '20px 0 4px' }}>
                    Контроль · {parts.control.length}
                  </Heading>
                  <Text muted size={13} style={{ marginBottom: 10 }}>
                    {`Дела менеджеров, не закрытые за ${term} ${plural(term, 'рабочий день', 'рабочих дня', 'рабочих дней')}: закрыть можно самому — ответить, опубликовать или разобрать.`}
                  </Text>
                  {attentionList(shownAttention.filter((row) => row.kind === 'control'))}
                </>
              )}
            </>
          ) : (
            attentionList(shownAttention)
          )}
          {shownAttention.length < attention.length ? (
            <div style={{ marginTop: 12 }}>
              <ButtonLink href="/cabinet/manage?attention=all#attention" tone="quiet">
                Показать все {attention.length}
              </ButtonLink>
            </div>
          ) : null}
        </Block>
      )}

      {/* «На этой неделе» — отдельным блоком, в «N дел» не входит: срок ещё
          не сорван, но подходит (требование М-06, ОМ-10, решение Р-304). */}
      {today.week.length === 0 ? null : (
        <Block id="week" style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            На этой неделе · {today.week.length}
          </Heading>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            {today.week.slice(0, 8).map((row) => (
              <li key={row.key} style={{ display: 'grid', gap: 2 }}>
                <a href={row.href} className="cab-mark" style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}>
                  {row.title}
                </a>
                <Text muted size={13}>
                  {`до ${formatDate(row.dueOn)}${row.turn === null ? '' : ` · ${row.turn}`}`}
                </Text>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* «Пульс практики» — период и четыре показателя с изменением к
          прошлому такому же периоду и мини-графиком (К-1, Р-585). Заменил
          полосу «Заказов · Действующих · Принято за 90 · Закрыто за 90»:
          действующие работы стоят в «Чем занята практика», окно в 90 дней
          осталось периодом по умолчанию. */}
      {pulse === null || pulseWin === null || !isShown(layout, 'pulse') ? null : (
        <section id="pulse" aria-label="Пульс практики" className="cab-block" style={{ marginBottom: 8, scrollMarginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Heading level={2} size={3}>
              {`Пульс практики ${pulseWin.caption}`}
            </Heading>
            <Tabs
              flush
              label="Период пульса"
              items={PULSE_PERIODS.map((item) => ({ href: periodHref(item.key), label: item.label, active: item.key === period }))}
            />
          </div>
          <Tiles>
            {pulse.map((metric) => {
              const money = metric.key === 'received';
              const change = pulseChange(metric.now, metric.before, pulseWin.against, (value) =>
                money ? formatRounded(value) : String(value),
              );
              return (
                <Tile
                  key={metric.key}
                  label={metric.label}
                  value={money ? formatRounded(metric.now) : String(metric.now)}
                  note={metric.detail === null ? change : `${metric.detail}; ${change}`}
                  chart={<Sparkline points={metric.series} />}
                />
              );
            })}
          </Tiles>
        </section>
      )}

      {/* Плашки «Сводки» — одного размера: сетка в два столбца, у всех
          плашек одна высота (замечание владельца 13.10.2026, решение
          Р-576). Прежде плашки стояли двумя колонками по содержимому
          (Р-489), и высоты расходились вдвое. Что длиннее плашки —
          работы, заявки — прокручивается внутри неё; «Числа» раскрываются
          поверх единого размера. Ниже 960 px — один столбец по
          содержимому (Р-320). */}
      {plates === null || shownPlates.length === 0 ? null : (
        <div className="cab-block cab-dash">
          {shownPlates.map((key) => (
            <Fragment key={key}>{plates[key]}</Fragment>
          ))}
        </div>
      )}

      {/* Менеджеру — две колонки: работы и заявки (решение Р-189). У
          руководителя они стоят в сетке плашек выше (Р-576). */}
      {load !== null ? null : (
        <Board columns={2}>
          <BoardColumn title={`${summary === null ? 'Мои работы' : 'Ведутся сейчас'} · ${works.length}`} href="/cabinet/projects" hrefLabel="все работы">
            {worksList}
          </BoardColumn>
          <BoardColumn
            title={queue.total === 0 ? 'Заявки' : `Заявки · ${queue.total}`}
            href={queue.total > 0 ? '/cabinet/manage/leads' : undefined}
            hrefLabel="все обращения"
          >
            {leadsList}
          </BoardColumn>
        </Board>
      )}

      {/* «Спросить руководителя» заменён веткой «руководитель — сотрудник»:
          вопрос и ответ остаются в кабинете (требование РК-07, решение
          Р-336; прежде — письмо, Р-199, Р-306). Руководителю спрашивать
          некого. */}
      {actor.role !== 'MANAGER' ? null : (
        <Card id="help" style={{ marginTop: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 4 }}>
            Руководитель практики
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            Спорный случай, нестандартная просьба клиента, сомнение по срокам или цене — напишите руководителю
            в кабинете; ответ придёт сюда же.
            {headReplies === 0 ? '' : ` Новых ответов: ${headReplies}.`} Порядок основных дел по шагам — в
            чек-листах практики.
          </Text>
          {/* Чек-листы менеджера: «Управления» у него нет, и без ссылки
              отсюда экран открывался бы только по набранному адресу
              (решения Р-158, Р-494). */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ButtonLink href="/cabinet/head">Написать руководителю</ButtonLink>
            <ButtonLink href="/cabinet/manage/checklists">Чек-листы</ButtonLink>
          </div>
        </Card>
      )}
    </Shell>
  );
}
