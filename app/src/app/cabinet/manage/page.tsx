import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { RADIUS, SANS } from '../../../components/cabinet/tokens';
import { BarChart, RankChart, compactNumber } from '../../../components/cabinet/Charts';
import {
  Block,
  Board,
  BoardColumn,
  ButtonLink,
  Card,
  Chip,
  Disclosure,
  Heading,
  Mono,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  Text,
  Tile,
  Tiles,
  clip,
  formatDate,
  plural,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { leadSourceLabel } from '../../../lib/cabinet/lead-labels';
import { formatAmount, formatPlain, outstandingOf } from '../../../lib/cabinet/money';
import type { StageStateKey } from '../../../lib/cabinet/stage-state';
import { unreadInbox } from '../../../lib/cabinet/messages';
import { pendingComments } from '../../../lib/cabinet/materials';
import { leadQueue, trafficLight } from '../../../lib/cabinet/queries';
import { outboxDigest } from '../../../lib/cabinet/outbox';
import { daysPast } from '../../../lib/cabinet/clock';
import { currentActor } from '../../../lib/cabinet/session';
import { byMonth, products } from '../../../lib/cabinet/analytics/metrics';
import { loadRows } from '../../../lib/cabinet/analytics/data';
import { activeWorks, moneyBrief, orderSummary, stageLoad } from '../../../lib/cabinet/summary';
export const dynamic = 'force-dynamic';

/**
 * Изменение к предыдущему такому же периоду.
 *
 * Число без сравнения не говорит ничего: «принято 2» — это много или
 * мало, зависит от того, сколько было кварталом раньше (решение Р-196).
 */
function delta(now: number, before: number): string {
  if (before === 0) return now === 0 ? 'кварталом раньше тоже ноль' : 'кварталом раньше не было';
  const change = now - before;
  if (change === 0) return `столько же, сколько кварталом раньше`;
  const percent = Math.round((Math.abs(change) / before) * 100);
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} к прошлому кварталу (${percent} %)`;
}

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
 * Чей сейчас ход. Состояние этапа названо не своим именем, а ответом на
 * вопрос менеджера: делать это ему, ждать ли клиента или исполнителя.
 */
const TURN_BY_STATE: Partial<Record<StageStateKey, string>> = {
  NOT_STARTED: 'ход за вами: этап не начат',
  IN_PROGRESS: 'ход за исполнителем',
  AWAITING_CLIENT: 'ход за клиентом',
  IN_APPROVAL: 'ход за клиентом: ждёт согласования',
};

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
 * Остаток по договору работы: сколько ещё не получено.
 *
 * На карточке просрочки это главная величина после самого срока: сорванный
 * этап у работы с закрытым остатком и у работы, где не получено полмиллиона,
 * — две разные беды.
 */
function owed(contract: {
  totalAmount: bigint;
  tranches: readonly { amount: bigint; status: string }[];
} | null): bigint {
  if (contract === null) return 0n;
  // Списанное под угрозой уже не числится (решение Р-240).
  return outstandingOf(contract.totalAmount, contract.tranches);
}

export default async function ManageQueue({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_MODERATE')) redirect('/cabinet/projects');

  const requested = Number((await searchParams).page ?? '1');
  // Справочник типов сопровождения на сводке больше не нужен: формы
  // одобрения уехали на экран заявки (решение Р-172).
  const [queue, light] = await Promise.all([
    leadQueue(actor, Number.isFinite(requested) ? requested : 1),
    trafficLight(actor),
  ]);
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
  const unread = await unreadInbox(actor);
  // Замечание эксперта висит неопубликованным, пока его не пропустят, и
  // клиенту не видно. Прежде о нём не говорил ни один экран (Р-183).
  const moderation = await pendingComments(actor);
  // Состояние очереди уведомлений видит только руководитель (решение Р-154):
  // менеджеру служебная кухня не нужна, а недоставленное письмо — забота
  // того, кто отвечает за практику целиком.
  const outbox = can(actor, 'AUDIT_VIEW') ? await outboxDigest(actor) : null;

  // Дашборд собирается только руководителю: деньги практики и её загрузка
  // целиком — его предмет, менеджеру на главной нужны свои дела
  // (решение Р-180). Прокрутка здесь разрешена: витрину в окно не уложить,
  // не отрезав от неё смысл.
  const dashboard = can(actor, 'ANALYTICS_VIEW');
  const analyticsRows = dashboard ? await loadRows(actor) : [];
  const months = dashboard ? byMonth(analyticsRows).slice(-12) : [];
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
  // Итоги по тому же ряду, что и столбцы: считать их заново неоткуда.
  const yearOrders = months.reduce((acc, month) => acc + month.orders, 0);
  const monthAverage =
    months.length === 0 ? '0' : (yearOrders / months.length).toFixed(1).replace('.', ',');
  const bestMonth = months.reduce<(typeof months)[number] | null>(
    (best, month) => (best === null || month.orders > best.orders ? month : best),
    null,
  );

  // «Требует внимания» — то, что нельзя оставить как есть: сорванный срок,
  // работа, которая ждёт клиента дольше двух недель, и непрочитанное
  // сообщение. У менеджера это главный экран целиком, у руководителя —
  // раздел под сводкой (решение Р-149).
  // Заголовком записи стоит работа и этап, а вид беды — пометкой рядом:
  // прежде три записи подряд начинались одинаково («Сорван срок этапа»), и
  // отличить их друг от друга можно было только по мелкому тексту ниже
  // (решение Р-182). Следующий шаг назван отдельной строкой: «Сорван срок»
  // без него оставляет решение на угадывание. Просрочка считается днями —
  // дату пришлось бы держать в уме.
  const attention = [
    ...light.overdue.map((stage: (typeof light.overdue)[number]) => {
      const late = overdueDays(stage.dueOn);
      const rest = maySeeMoney ? owed(stage.project.contract) : 0n;
      return {
        key: `overdue-${stage.id}`,
        title: `${stage.title} · ${stage.project.title}`,
        mark: late === null ? 'срок сегодня' : `просрочено ${late} ${plural(late, 'день', 'дня', 'дней')}`,
        urgent: true,
        step: alertStep(late),
        // Чей ход — первое, что нужно знать: своё дело менеджер закрывает
        // сам, чужое требует письма или звонка.
        detail: [
          // Руководителю «ход за вами» по чужой работе говорил неправду:
          // этап начинает куратор (решение Р-206).
          stage.state === 'NOT_STARTED' && stage.project.managerId !== actor.id
            ? 'ход за куратором: этап не начат'
            : (TURN_BY_STATE[stage.state as StageStateKey] ?? null),
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
    ...light.lateWorks.map((work: (typeof light.lateWorks)[number]) => {
      const late = overdueDays(work.dueOn);
      const rest = maySeeMoney ? owed(work.contract) : 0n;
      return {
        key: `late-${work.id}`,
        title: work.title,
        mark:
          late === null
            ? 'срок работы сегодня'
            : `срок работы прошёл ${late} ${plural(late, 'день', 'дня', 'дней')} назад`,
        urgent: true,
        step: alertStep(late),
        detail: [
          work._count.stages === 0 ? 'план работ не заведён' : null,
          work.client.fullName,
          rest > 0n ? `не получено ${formatAmount(rest)}` : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
        todo:
          work._count.stages === 0
            ? 'Назначить новый срок, завести план или закрыть работу'
            : 'Назначить новый срок работы или закрыть её',
        href: `/cabinet/projects/${work.code}`,
      };
    }),
    // Этап, уже названный просроченным, второй плашкой «ждёт клиента» не
    // повторяется: одна работа стояла на сводке дважды (решение Р-206).
    ...light.stalled
      .filter((stage: (typeof light.stalled)[number]) =>
        light.overdue.every((late: (typeof light.overdue)[number]) => late.id !== stage.id),
      )
      .map((stage: (typeof light.stalled)[number]) => ({
      key: `stalled-${stage.id}`,
      step: 0 as const,
      title: `${stage.title} · ${stage.project.title}`,
      mark:
        stage.awaitingClientSince === null
          ? 'ждёт клиента'
          : `ждёт клиента с ${formatDate(stage.awaitingClientSince)}`,
      urgent: false,
      detail: stage.project.client.fullName,
      todo: 'Напомнить клиенту о материалах',
      href: `/cabinet/stages/${stage.id}`,
    })),
    ...unread.map((row) => ({
      key: `unread-${row.code}`,
      step: 0 as const,
      title: row.title,
      mark: `${row.count} ${plural(row.count, 'непрочитанное', 'непрочитанных', 'непрочитанных')}`,
      urgent: false,
      detail: null,
      todo: 'Ответить клиенту',
      href: `/cabinet/projects/${row.code}/messages`,
    })),
    ...moderation.map((row) => ({
      key: `comment-${row.stageId ?? row.material}`,
      step: 0 as const,
      title: `${row.stageTitle} · ${row.projectTitle}`,
      mark: `${row.count} ${plural(row.count, 'замечание', 'замечания', 'замечаний')} на модерации`,
      urgent: false,
      detail: row.material,
      todo: 'Опубликовать или отклонить — до этого клиент их не видит',
      href: row.stageId === null ? '/cabinet/projects' : `/cabinet/stages/${row.stageId}`,
    })),
    ...(outbox !== null && outbox.failed > 0
      ? [
          {
            key: 'outbox',
            step: 0 as const,
            title: 'Очередь уведомлений',
            mark: `не доставлено ${outbox.failed}`,
            urgent: true,
            detail: 'Письма и сообщения, не ушедшие после пяти попыток',
            todo: 'Разобрать очередь и отправить заново',
            href: '/cabinet/manage/outbox',
          },
        ]
      : []),
  ];

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
        lateCount === 0
          ? null
          : `Сорвано сроков — ${lateCount}; старший — «${clip(oldest?.title ?? '', 48)}»${
              oldestLate === null ? '' : `, ${oldestLate} ${plural(oldestLate, 'день', 'дня', 'дней')}`
            }.`,
        summary === null ? null : `В работе ${summary.active} ${plural(summary.active, 'работа', 'работы', 'работ')}.`,
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
        title={summary === null ? 'Работа на сегодня' : 'Практика'}
        answer={answer}
        action={
          dashboard ? <ButtonLink href="/cabinet/manage/report">Отчёт за период</ButtonLink> : undefined
        }
      />

      {/* «Требует внимания» — верхней полосой отдельными плашками, а не
          колонкой: заказчик смотрит сводку сверху вниз, и то, что нельзя
          оставить как есть, должно встречать первым. Каждая запись —
          своя плашка с переходом на задачу (решение Р-189). У
          руководителя полоса стояла под плитками и графиками, на втором
          экране прокрутки, — вопреки тому же решению; теперь она сразу
          под ответом, а витрина практики ниже (решение Р-210). */}
      {attention.length === 0 ? null : (
        <Block style={{ marginBottom: 20 }}>
          <Heading level={2} style={{ marginBottom: 12 }}>
            Требует внимания · {attention.length}
          </Heading>
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
            {attention.map((row) => (
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
        </Block>
      )}

      {summary === null ? null : (
        <div>
          <Tiles>
            <Tile label="Заказов" value={String(summary.orders)} note="за всё время" />
            {/* «Действующих», а не «В работе»: рядом график называет «В
                работе» состояние этапа, и два разных числа под одним словом
                читались как расхождение (решение Р-211). */}
            <Tile label="Действующих работ" value={String(summary.active)} note="сейчас ведутся" />
            <Tile
              label="Принято за квартал"
              value={String(summary.startedLastQuarter)}
              note={delta(summary.startedLastQuarter, summary.startedPrevQuarter)}
            />
            <Tile
              label="Закрыто за квартал"
              value={String(summary.closedLastQuarter)}
              note={delta(summary.closedLastQuarter, summary.closedPrevQuarter)}
            />
          </Tiles>
        </div>
      )}

      {/* Два графика отвечают на два вопроса: сколько работ приходит
          месяц за месяцем и чем практика занята прямо сейчас. Денег
          здесь нет — им отведён свой экран (решение Р-194). Поле рисунка
          совпадает с шириной карточки: при жёстком поле в 560 пикселей
          на карточке в 580 всё растягивалось и кегли шли вразнобой. */}
      {load === null ? null : (
        <div
          style={{
            display: 'grid',
            // Не больше двух плашек в ряду (решение Р-189).
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(440px,100%),1fr))',
            gap: 20,
            marginBottom: 24,
            maxWidth: 'calc(2 * 600px + 20px)',
          }}
        >
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <Heading level={2} size={3} style={{ marginBottom: 12 }}>
              Заказы по месяцам
            </Heading>
            <BarChart
              title="Принято заказов по месяцам"
              width={460}
              height={220}
              unit="работ"
              data={months.map((month) => ({ label: month.label, value: month.orders }))}
              format={(value) => String(Math.round(value))}
            />
            <Text muted size={13} style={{ marginTop: 10 }}>
              По месяцу начала работы, последние двенадцать месяцев.
            </Text>
            {months.length === 0 ? null : (
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
          </Card>

          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <Heading level={2} size={3} style={{ marginBottom: 12 }}>
              Чем занята практика
            </Heading>
            {load.points.length === 0 ? (
              <Text muted>Действующих работ нет.</Text>
            ) : (
              <RankChart
                title="Работы по состоянию текущего этапа"
                width={460}
                labelWidth={200}
                data={load.points.map((point) => ({ label: point.label, value: point.count }))}
                format={(value) => String(Math.round(value))}
              />
            )}
            <div
              style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}
            >
              {load.overdue === 0 ? null : (
                <Chip tone="accent">
                  {load.overdue} {plural(load.overdue, 'работа', 'работы', 'работ')} со сроком в
                  прошлом
                </Chip>
              )}
              {/* Работы без плана стоят в графике своей строкой, пометкой
                  они не повторяются (решение Р-216). */}
            </div>
            <Text muted size={13} style={{ marginTop: 10 }}>
              Состояние берётся у первого незавершённого этапа: он и есть то, где работа стоит
              сейчас. Работы, перенесённые из книги без плана, стоят своей строкой.
            </Text>
            {/* Числа стоят и текстом: график объявлен картинкой, и читалка
                получает от него одно название (правило Р-176). */}
            <div style={{ marginTop: 'auto' }} />
            {load.points.length === 0 ? null : (
              <Disclosure title="Числа" style={{ marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={TABLE_HEAD} scope="col">Состояние</th>
                      <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Работ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {load.points.map((point) => (
                      <tr key={point.key}>
                        <td style={TABLE_CELL}>{point.label}</td>
                        <td style={TABLE_NUM}>{point.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Disclosure>
            )}
          </Card>

          {demand.length === 0 ? null : (
            <Card style={{ display: 'flex', flexDirection: 'column' }}>
              <Heading level={2} size={3} style={{ marginBottom: 12 }}>
                Что заказывают
              </Heading>
              <RankChart
                title="Заказы по типам сопровождения за год"
                width={460}
                labelWidth={200}
                data={demand.map((item) => ({ label: item.typeName, value: item.orders }))}
                format={(value) => String(Math.round(value))}
              />
              <Text muted size={13} style={{ marginTop: 10 }}>
                Те же двенадцать месяцев, что на графике слева, по дате начала работы; шесть
                крупнейших позиций из{' '}
                {demandTotal} {plural(demandTotal, 'заказа', 'заказов', 'заказов')}.
              </Text>
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
                    {demand.map((item) => (
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
            </Card>
          )}

          {/* Четвёртая плашка: ближайшие сроки и деньги коротко. Прежде
              справа снизу пустовало место, а сроки жили внутри карточки
              загрузки и делали её график мелким (решение Р-201). */}
          {money === null ? null : (
            <Card style={{ display: 'flex', flexDirection: 'column' }}>
              <Heading level={2} size={3} style={{ marginBottom: 12 }}>
                Ближайшие сроки и деньги
              </Heading>

              {load === null || load.soon.length === 0 ? (
                <Text muted size={14}>
                  В ближайшие две недели сроков не назначено.
                </Text>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                  {load.soon.slice(0, 5).map((row) => (
                    <li
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0,1fr) auto',
                        gap: 12,
                        alignItems: 'baseline',
                      }}
                    >
                      <a
                        href={`/cabinet/stages/${row.id}`}
                        className="cab-mark"
                        style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5 }}
                      >
                        {row.stage} · {row.title}
                      </a>
                      <Text muted size={13} style={{ whiteSpace: 'nowrap' }}>
                        {formatDate(row.dueOn)}
                      </Text>
                    </li>
                  ))}
                </ul>
              )}
              {load === null || load.soon.length <= 5 ? null : (
                <Text muted size={13} style={{ marginTop: 10 }}>
                  И ещё {load.soon.length - 5}{' '}
                  {plural(load.soon.length - 5, 'срок', 'срока', 'сроков')} в том же окне.
                </Text>
              )}

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
                  { key: 'got', label: 'Получено', value: formatPlain(money.received) },
                  { key: 'wait', label: 'К получению', value: formatPlain(money.awaiting) },
                  {
                    key: 'debt',
                    label: 'Просрочено',
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
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <Text muted size={13} style={{ marginTop: 10 }}>
                Суммы в рублях. Разбор по работам — на экране денег.
              </Text>
              <div style={{ marginTop: 'auto' }} />
              <div style={{ marginTop: 12 }}>
                <ButtonLink href="/cabinet/manage/finance">Деньги и расчёты</ButtonLink>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Ниже — два цельных блока с прокруткой: работы и заявки. Третья
          колонка ужимала все три и заставляла строки рваться посреди
          слова (решение Р-189). */}
      <Board columns={2}>
        <BoardColumn
          title={`${summary === null ? 'Мои работы' : 'Сейчас в работе'} · ${works.length}`}
          href="/cabinet/projects"
          hrefLabel="все работы"
        >
          {works.length === 0 ? (
            <Text muted>Действующих работ нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {works.map((work, index) => {
                const late = overdueDays(work.dueOn);
                return (
                  <li
                    key={work.code}
                    style={{
                      display: 'grid',
                      gap: 6,
                      // Записи разделены едва заметной линией: сплошной
                      // список из шести работ читался единым полотном
                      // (решение Р-189).
                      ...(index === 0
                        ? { paddingBottom: 14 }
                        : {
                            borderTop: '1px solid var(--pd-divider)',
                            paddingTop: 14,
                            paddingBottom: 14,
                          }),
                    }}
                  >
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
                    </Text>
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
                    {work.contracted === null ? null : (
                      <Text muted size={13}>
                        {formatPlain(work.contracted)} ₽ по договору
                        {work.outstanding !== null && work.outstanding > 0n
                          ? ` · ${formatPlain(work.outstanding)} ₽ не оплачено`
                          : ' · оплачено полностью'}
                      </Text>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </BoardColumn>

        <BoardColumn
          title={queue.total === 0 ? 'Заявки' : `Заявки · ${queue.total}`}
          href={queue.total > 0 ? '/cabinet/manage/leads' : undefined}
          hrefLabel="все обращения"
        >
          {leads.length === 0 ? (
            <Text muted>Новых заявок нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {/* Контакт стоит в строке, а разбор начинается кнопкой:
                  прежде за тем и другим приходилось заходить внутрь, а
                  менеджер решает по заявке за секунды (решение Р-180). */}
              {leads.map((lead, index) => (
                <li
                  key={lead.id}
                  style={{
                    display: 'grid',
                    gap: 4,
                    paddingTop: index === 0 ? 0 : 14,
                    paddingBottom: 14,
                    ...(index === 0 ? {} : { borderTop: '1px solid var(--pd-divider)' }),
                  }}
                >
                  <a
                    href={`/cabinet/manage/leads/${lead.id}`}
                    className="cab-mark"
                    style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600 }}
                  >
                    {lead.name ?? 'Без имени'}
                  </a>
                  <Text muted size={13}>
                    {leadSourceLabel(lead.source)} · {formatDate(lead.createdAt)}
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
        </BoardColumn>
      </Board>
    </Shell>
  );
}
