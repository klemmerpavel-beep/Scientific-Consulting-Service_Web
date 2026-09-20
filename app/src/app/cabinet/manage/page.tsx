import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { SANS } from '../../../components/cabinet/tokens';
import { BarChart, RankChart, compactNumber } from '../../../components/cabinet/Charts';
import {
  Board,
  BoardColumn,
  ButtonLink,
  Card,
  Chip,
  Disclosure,
  Heading,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  Text,
  Tile,
  Tiles,
  formatDate,
  plural,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { leadSourceLabel } from '../../../lib/cabinet/lead-labels';
import { formatAmount, formatPlain } from '../../../lib/cabinet/money';
import { unreadInbox } from '../../../lib/cabinet/messages';
import { pendingComments } from '../../../lib/cabinet/materials';
import { leadQueue, trafficLight } from '../../../lib/cabinet/queries';
import { outboxDigest } from '../../../lib/cabinet/outbox';
import { currentActor } from '../../../lib/cabinet/session';
import { byMonth } from '../../../lib/cabinet/analytics/metrics';
import { loadRows } from '../../../lib/cabinet/analytics/data';
import {
  OVERHEAD_PERCENT,
  activeWorks,
  practiceSummary,
  stageLoad,
} from '../../../lib/cabinet/summary';
export const dynamic = 'force-dynamic';

/** Сколько дней прошло с назначенного срока; до срока — ничего. */
function overdueDays(dueOn: Date | null): number | null {
  if (dueOn === null) return null;
  const days = Math.floor((Date.now() - dueOn.getTime()) / 86_400_000);
  return days > 0 ? days : null;
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

  // Сводка — это деньги практики, и её видит только тот, кому открыта маржа.
  const summary = can(actor, 'MARGIN_VIEW') ? await practiceSummary(actor) : null;
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
  const months = dashboard ? byMonth(await loadRows(actor)).slice(-12) : [];
  const load = dashboard ? await stageLoad(actor) : null;
  // Итоги по тому же ряду, что и столбцы: считать их заново неоткуда.
  const yearTotal = months.reduce((acc, month) => acc + month.received, 0n);
  const monthAverage = months.length === 0 ? 0n : yearTotal / BigInt(months.length);
  const bestMonth = months.reduce<(typeof months)[number] | null>(
    (best, month) => (best === null || month.received > best.received ? month : best),
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
      return {
        key: `overdue-${stage.id}`,
        title: `${stage.title} · ${stage.project.code}`,
        mark: late === null ? 'срок сегодня' : `просрочено ${late} ${plural(late, 'день', 'дня', 'дней')}`,
        urgent: true,
        detail: stage.project.client.fullName,
        todo: 'Назначить новый срок или перевести этап',
        href: `/cabinet/stages/${stage.id}`,
      };
    }),
    ...light.stalled.map((stage: (typeof light.stalled)[number]) => ({
      key: `stalled-${stage.id}`,
      title: `${stage.title} · ${stage.project.code}`,
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
      title: `${row.title} · ${row.code}`,
      mark: `непрочитанных ${row.count}`,
      urgent: false,
      detail: null,
      todo: 'Ответить клиенту',
      href: `/cabinet/projects/${row.code}/messages`,
    })),
    ...moderation.map((row) => ({
      key: `comment-${row.stageId ?? row.material}`,
      title: `${row.stageTitle} · ${row.projectCode}`,
      mark: `замечаний на модерации ${row.count}`,
      urgent: false,
      detail: row.material,
      todo: 'Опубликовать или отклонить — до этого клиент их не видит',
      href: row.stageId === null ? '/cabinet/projects' : `/cabinet/stages/${row.stageId}`,
    })),
    ...(outbox !== null && outbox.failed > 0
      ? [
          {
            key: 'outbox',
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

  return (
    <Shell actor={actor} current="/cabinet/manage" board>
      {/* Сводка — первый экран после входа обеих служебных ролей, и она
          показывает всё главное сразу: что нельзя оставить как есть, что
          в работе и что ждёт разбора. Прежде заголовок первого уровня
          плавал — у руководителя «Практика», у менеджера «Требует
          внимания», — и один блок был набран двумя способами
          (решение Р-172). */}
      <ScreenHead title={summary === null ? 'Работа на сегодня' : 'Практика'} />

      {summary === null ? null : (
        <div>
          <Tiles>
            <Tile label="Заказов" value={String(summary.orders)} note={`${summary.active} в работе`} />
            <Tile label="Выручка" value={formatAmount(summary.received)} note="получено" />
            <Tile
              label="Прибыль"
              value={formatAmount(summary.profit)}
              note={`выручка минус ${OVERHEAD_PERCENT} % расходов`}
            />
            <Tile label="К получению" value={formatAmount(summary.outstanding)} note="не оплачено" />
          </Tiles>
        </div>
      )}

      {/* Деньги и загрузка стоят рядом: плитки отвечают, сколько денег, а
          эти два графика — когда они приходят и чем практика занята
          сейчас. Порядок в загрузке — ход работы, а не убывание числа
          (решение Р-180). */}
      {load === null ? null : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(440px,1fr))',
            gap: 20,
            marginBottom: 24,
          }}
        >
          {/* Карточки — колонками, и свёртка с числами прижата к низу:
              иначе та, что короче, оставляла под собой пустое поле в
              полторы сотни пикселей (решение Р-182). */}
          <Card style={{ display: 'flex', flexDirection: 'column' }}>
            <Heading level={2} size={3} style={{ marginBottom: 12 }}>
              Деньги по месяцам
            </Heading>
            <BarChart
              title="Поступления по месяцам"
              width={560}
              height={220}
              unit="тыс ₽"
              data={months.map((month) => ({
                label: month.label,
                value: Number(month.received) / 100_000,
              }))}
              format={(value) => compactNumber(value, 0)}
            />
            <Text muted size={13} style={{ marginTop: 10 }}>
              Получено по месяцу заказа, последние двенадцать месяцев.
            </Text>
            {/* Три числа под графиком отвечают на то, чего столбцы не
                говорят: сколько всего, сколько в среднем и когда был
                лучший месяц. Заодно карточка перестала пустовать снизу
                (решение Р-182). */}
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
                  { key: 'sum', label: 'За двенадцать месяцев', value: formatAmount(yearTotal) },
                  { key: 'avg', label: 'В среднем в месяц', value: formatAmount(monthAverage) },
                  {
                    key: 'best',
                    label: 'Лучший месяц',
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
                    <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Получено</th>
                    <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Заказов</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.key}>
                      <td style={TABLE_CELL}>{month.label}</td>
                      <td style={TABLE_NUM}>{formatAmount(month.received)}</td>
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
                width={560}
                labelWidth={220}
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
              {load.planless === 0 ? null : (
                <Chip>
                  {load.planless} без плана работ
                </Chip>
              )}
            </div>
            <Text muted size={13} style={{ marginTop: 10 }}>
              Состояние берётся у первого незавершённого этапа: он и есть то, где работа стоит
              сейчас.
            </Text>
            {/* Полосы говорят, чем практика занята, но не когда наступает
                следующий срок. Перечень ближайших двух недель отвечает на
                это и заодно наполняет карточку: прежде она была ниже
                соседней и пустовала снизу (решение Р-182). */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--pd-divider)', paddingTop: 14 }}>
              <Heading level={3} size={3} style={{ marginBottom: 10 }}>
                Сроки ближайших двух недель
              </Heading>
              {load.soon.length === 0 ? (
                <Text muted size={13}>
                  В ближайшие две недели сроков не назначено.
                </Text>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                  {load.soon.slice(0, 6).map((row) => (
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
                        style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.5 }}
                      >
                        {row.stage} · {row.code}
                      </a>
                      <Text muted size={13} style={{ whiteSpace: 'nowrap' }}>
                        {formatDate(row.dueOn)}
                      </Text>
                    </li>
                  ))}
                </ul>
              )}
              {load.soon.length <= 6 ? null : (
                <Text muted size={13} style={{ marginTop: 10 }}>
                  И ещё {load.soon.length - 6}{' '}
                  {plural(load.soon.length - 6, 'срок', 'срока', 'сроков')} в том же окне.
                </Text>
              )}
            </div>
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
        </div>
      )}

      {/* Доли ширины неравные: у «Заявок» строка короткая, а в двух
          других колонках при равной трети рвались слова — «Подготовка / к
          предзащите» (решение Р-175). Колонки сжимаются по содержимому:
          прежде колонка с одной строкой держала пустое поле до низа окна. */}
      {/* Колонки равной ширины и равной высоты: заказчик требует, чтобы
          карточки и блоки были одного размера. Прежде доли были неравными
          (1,15 / 1,15 / 0,7), а `fit` сжимал колонку по содержимому, и
          разброс высоты доходил до семисот пикселей (решение Р-185). */}
      <Board columns={works.length === 0 ? 2 : 3}>
        <BoardColumn
          title={
            attention.length === 0 ? 'Требует внимания' : `Требует внимания · ${attention.length}`
          }
          flow
        >
          {attention.length === 0 ? (
            <Text muted>Сейчас ничего не требует вмешательства.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
              {attention.map((row) => (
                <li key={row.key} style={{ display: 'grid', gap: 6 }}>
                  {/* Ведёт сама запись: отдельная строка «Открыть» под
                      каждой занимала 44 пикселя и вела туда же. */}
                  <a
                    href={row.href}
                    style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}
                  >
                    {row.title}
                  </a>
                  {/* Пометка стоит своей строкой, а не внутри абзаца: чип
                      в потоке текста разрывает строку и уводит остаток
                      вниз (решение Р-182). */}
                  <div>
                    <Chip tone={row.urgent ? 'accent' : 'neutral'}>{row.mark}</Chip>
                  </div>
                  {row.detail === null ? null : (
                    <Text muted size={13}>
                      {row.detail}
                    </Text>
                  )}
                  <Text size={13}>{row.todo}</Text>
                </li>
              ))}
            </ul>
          )}
        </BoardColumn>

        {works.length === 0 ? null : (
          <BoardColumn
            title={`${summary === null ? 'Мои работы' : 'Сейчас в работе'} · ${works.length}`}
            href="/cabinet/projects"
            hrefLabel="все работы"
            flow
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
              {works.map((work) => {
                const late = overdueDays(work.dueOn);
                return (
                  <li key={work.code} style={{ display: 'grid', gap: 6 }}>
                    <a
                      href={`/cabinet/projects/${work.code}`}
                      style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}
                    >
                      {work.title}
                    </a>
                    <Text muted size={13}>
                      {work.code} · {work.client}
                      {work.stage === null ? '' : ` · ${work.stage}`}
                    </Text>
                    {/* Срок стоит ровно в одном месте строки. Просрочка
                        названа днями, а не датой: «срок 1 сентября 2025»
                        требует считать в уме, «просрочено 384 дня» — нет
                        (решение Р-180). Пометка занимает свою строку:
                        внутри абзаца она разрывала текст (решение Р-182). */}
                    {late === null ? (
                      <Text muted size={13}>
                        {work.dueOn === null ? 'срок не назначен' : `срок ${formatDate(work.dueOn)}`}
                      </Text>
                    ) : (
                      <div>
                        <Chip tone="accent">
                          просрочено {late} {plural(late, 'день', 'дня', 'дней')}
                        </Chip>
                      </div>
                    )}
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
          </BoardColumn>
        )}

        <BoardColumn
          title={queue.total === 0 ? 'Заявки' : `Заявки · ${queue.total}`}
          href={queue.total > 0 ? '/cabinet/manage/leads' : undefined}
          hrefLabel="все обращения"
          flow
        >
          {leads.length === 0 ? (
            <Text muted>Новых заявок нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {/* Контакт стоит в строке, а разбор начинается кнопкой:
                  прежде за тем и другим приходилось заходить внутрь, а
                  менеджер решает по заявке за секунды (решение Р-180). */}
              {leads.map((lead) => (
                <li key={lead.id} style={{ display: 'grid', gap: 4 }}>
                  <a
                    href={`/cabinet/manage/leads/${lead.id}`}
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
