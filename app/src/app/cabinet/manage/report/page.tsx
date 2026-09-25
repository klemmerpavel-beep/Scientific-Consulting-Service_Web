import { redirect } from "next/navigation";

import Shell from "../../../../components/cabinet/Shell";
import { SANS } from "../../../../components/cabinet/tokens";
import {
  Card,
  Heading,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  Tabs,
  Text,
  Tile,
  Tiles,
  TableScroll,
  formatDate,
  plural,
} from "../../../../components/cabinet/ui";
import { can } from "../../../../lib/cabinet/access";
import { formatAmount, formatPlain } from "../../../../lib/cabinet/money";
import { currentActor } from "../../../../lib/cabinet/session";
import { loadRows } from "../../../../lib/cabinet/analytics/data";
import {
  byMonth,
  clients,
  conclusions,
  overview,
  products,
  receivables,
  receivedBetween,
  verdict,
  type ProjectRow,
} from "../../../../lib/cabinet/analytics/metrics";
import { now as clockNow } from "../../../../lib/cabinet/clock";

export const dynamic = "force-dynamic";

/**
 * Отчёт руководителя за период.
 *
 * Заказчик просил кнопку справа вверху и отчёт за месяц, квартал или год
 * со сводом по разделам «Работы», «Деньги», «Аналитика» (решение Р-201).
 *
 * Отчёт — обычная страница кабинета, а не выгрузка файла: сборщика `.xlsx`
 * на запись в проекте нет, а `.pdf` браузер печатает сам. Печатные правила
 * лежат в общих стилях: шапка, навигация и подвал уходят, свёртки
 * раскрываются, карточки не рвутся посередине.
 *
 * Отбора по правам здесь не заводится: выборка идёт тем же `loadRows`,
 * который сужает перечень через `scopeProjects`, а вход на экран закрыт
 * правом на аналитику.
 */

type PeriodKey = "month" | "quarter" | "year";

const PERIODS: readonly {
  key: PeriodKey;
  label: string;
  days: number;
  words: string;
}[] = [
  {
    key: "month",
    label: "Месяц",
    days: 30,
    words: "за последние тридцать дней",
  },
  {
    key: "quarter",
    label: "Квартал",
    days: 90,
    words: "за последние девяносто дней",
  },
  {
    key: "year",
    label: "Год",
    days: 365,
    words: "за последние двенадцать месяцев",
  },
];

/** Работа относится к периоду, если она в нём началась либо закрылась. */
function inPeriod(row: ProjectRow, from: Date): boolean {
  if (row.startedOn !== null && row.startedOn >= from) return true;
  return row.closedOn !== null && row.closedOn >= from;
}

export default async function ReportScreen({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect("/cabinet");
  if (!can(actor, "ANALYTICS_VIEW")) redirect("/cabinet/projects");

  const asked = (await searchParams).period;
  const period = PERIODS.find((item) => item.key === asked) ?? PERIODS[0];
  const today = clockNow();
  const from = new Date(today.getTime() - period.days * 86_400_000);

  const all = await loadRows(actor);
  const rows = all.filter((row) => inPeriod(row, from));

  const sum = overview(rows);
  const whole = overview(all);
  const started = rows.filter(
    (row) => row.startedOn !== null && row.startedOn >= from,
  );
  const closed = rows.filter(
    (row) => row.closedOn !== null && row.closedOn >= from,
  );
  const late = all.filter(
    (row) =>
      row.status === "ACTIVE" &&
      row.dueOn !== null &&
      row.dueOn.getTime() < today.getTime(),
  );

  // Пустые месяцы из таблицы убираются: ряд `byMonth` начинается первым
  // заказом, и отчёт за тридцать дней тянул бы два десятка нулевых строк
  // ради двух содержательных (решение Р-201).
  const months = byMonth(rows).filter(
    (month) => month.orders > 0 || month.contracted > 0n || month.received > 0n,
  );
  const demand = products(rows)
    .slice()
    .sort((a, b) => b.orders - a.orders);
  const clientReport = clients(all, today);
  const debts = receivables(all, today).filter(
    (debt) => (debt.overdueDays ?? 0) > 0,
  );
  const debtSum = debts.reduce((acc, debt) => acc + debt.debt, 0n);
  const advice = conclusions(all, today);
  const digest = verdict(all, today);

  return (
    <Shell actor={actor} current="/cabinet/manage">
      <ScreenHead
        backHref="/cabinet/manage"
        backLabel="практика"
        title="Отчёт практики"
        note={`Свод ${period.words}. Составлен ${formatDate(today)}.`}
      />

      <div className="cab-no-print">
        <Tabs
          label="Период отчёта"
          items={PERIODS.map((item) => ({
            href: `/cabinet/manage/report?period=${item.key}`,
            label: item.label,
            active: item.key === period.key,
          }))}
        />
        <Text muted size={13} style={{ marginTop: -8, marginBottom: 20 }}>
          Чтобы сохранить отчёт файлом, напечатайте страницу: Ctrl + P, а на Mac
          ⌘ + P, и в диалоге выберите «Сохранить в PDF». Служебные полосы
          кабинета в печать не идут.
        </Text>
      </div>

      {/* Своды обёрнуты общим `div`: сценарий движения сайта забирает
          `main > section` и дописывает плашкам задержку появления прямо в
          разметку, а снимок принимает облик, а не движение (решение
          Р-186). */}
      <div>
        {/* Итог первой строкой: отчёт читают не глазами по таблицам, а
            по одному абзацу сверху (решение Р-202). */}
        {digest === null ? null : (
          <Card style={{ marginBottom: 20 }}>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Итог
            </Heading>
            <Text size={15}>{digest.state}</Text>
            {digest.risk === null ? null : (
              <Text size={15} style={{ marginTop: 8 }}>
                <strong style={{ fontWeight: 600 }}>Под угрозой: </strong>
                {digest.risk}
              </Text>
            )}
            {digest.first === null ? null : (
              <Text size={15} style={{ marginTop: 8 }}>
                <strong style={{ fontWeight: 600 }}>Первым делом: </strong>
                {digest.first}
              </Text>
            )}
          </Card>
        )}

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Работы
          </Heading>
          <Tiles inset>
            <Tile
              label="Принято"
              value={String(started.length)}
              note={period.words}
            />
            <Tile
              label="Завершено"
              value={String(closed.length)}
              note={period.words}
            />
            <Tile
              label="В работе"
              value={String(whole.active)}
              note="на день отчёта"
            />
            <Tile
              label="Сорвано сроков"
              value={String(late.length)}
              note="действующих работ со сроком в прошлом"
            />
          </Tiles>
          {rows.length === 0 ? (
            <Text muted size={14} style={{ marginTop: 14 }}>
              За период работ не начиналось и не закрывалось.
            </Text>
          ) : (
            <TableScroll label="Работы за период">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 16,
              }}
            >
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">
                    Работа
                  </th>
                  <th style={TABLE_HEAD} scope="col">
                    Тип сопровождения
                  </th>
                  <th style={TABLE_HEAD} scope="col">
                    Начата
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Договор
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Получено
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={TABLE_CELL}>{row.title}</td>
                    <td style={TABLE_CELL}>{row.typeName}</td>
                    <td style={TABLE_CELL}>
                      {row.startedOn === null ? "—" : formatDate(row.startedOn)}
                    </td>
                    <td style={TABLE_NUM}>{formatPlain(row.cost)}</td>
                    <td style={TABLE_NUM}>{formatPlain(row.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Деньги
          </Heading>
          <Tiles inset>
            <Tile
              label="Законтрактовано"
              value={formatAmount(sum.contracted)}
              note={period.words}
            />
            <Tile
              label="Получено"
              value={formatAmount(receivedBetween(all, from, today))}
              note={period.words}
            />
            <Tile
              label="К получению"
              value={formatAmount(whole.outstanding)}
              note="по всем работам"
            />
            <Tile
              label="Просрочено"
              value={formatAmount(debtSum)}
              note={`${debts.length} ${plural(debts.length, "работа", "работы", "работ")} со сроком в прошлом`}
            />
          </Tiles>
          <Text muted size={13} style={{ marginTop: 12 }}>
            Собрано по завершённым работам {Math.round(whole.collection * 100)}{" "}
            %; средний чек за период — {formatAmount(sum.averageCheck)}.
          </Text>
          {months.length === 0 ? null : (
            <TableScroll label="Деньги по месяцам">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 16,
              }}
            >
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">
                    Месяц
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Заказов
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Законтрактовано
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Получено
                  </th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.key}>
                    <td style={TABLE_CELL}>{month.label}</td>
                    <td style={TABLE_NUM}>{month.orders}</td>
                    <td style={TABLE_NUM}>{formatPlain(month.contracted)}</td>
                    <td style={TABLE_NUM}>{formatPlain(month.received)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Аналитика
          </Heading>
          <Tiles inset>
            <Tile
              label="Клиентов"
              value={String(clientReport.clients.length)}
              note="за всё время"
            />
            <Tile
              label="Повторных"
              value={String(clientReport.repeat)}
              note="заказывали больше одного раза"
            />
            <Tile
              label="Доля первых пяти"
              value={`${Math.round(clientReport.top5Share * 100)} %`}
              note="в сумме договоров"
            />
          </Tiles>
          {demand.length === 0 ? null : (
            <TableScroll label="Что заказывали">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: 16,
              }}
            >
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">
                    Тип сопровождения
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Заказов
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Законтрактовано
                  </th>
                  <th style={{ ...TABLE_HEAD, textAlign: "right" }} scope="col">
                    Средний чек
                  </th>
                </tr>
              </thead>
              <tbody>
                {demand.map((item) => (
                  <tr key={item.typeCode}>
                    <td style={TABLE_CELL}>{item.typeName}</td>
                    <td style={TABLE_NUM}>{item.orders}</td>
                    <td style={TABLE_NUM}>{formatPlain(item.total)}</td>
                    <td style={TABLE_NUM}>{formatPlain(item.averageCheck)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableScroll>
          )}
        </Card>

        {advice.length === 0 ? null : (
          <Card>
            <Heading level={2} size={3} style={{ marginBottom: 4 }}>
              Что делать
            </Heading>
            <Text muted size={14} style={{ marginBottom: 14 }}>
              Выводы считаются из собственных чисел практики; оценка эффекта
              приводится там, где её можно вывести честно.
            </Text>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: 14,
              }}
            >
              {advice.map((item) => (
                <li
                  key={item.title}
                  style={{
                    borderTop: "1px solid var(--pd-divider)",
                    paddingTop: 12,
                  }}
                >
                  <Heading level={3} size={3} style={{ marginBottom: 4 }}>
                    {item.title}
                  </Heading>
                  <Text muted size={13} style={{ marginBottom: 6 }}>
                    {item.area} · срок: {item.term}
                    {item.effect === null
                      ? ""
                      : ` · оценка: ${formatAmount(item.effect)}`}
                  </Text>
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontFamily: SANS,
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.text}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: SANS,
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.action}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Shell>
  );
}
