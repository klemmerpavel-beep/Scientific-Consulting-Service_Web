import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Card,
  Chip,
  Heading,
  Narrow,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TableCard,
  Tabs,
  Text,
  formatDate,
  formatDay,
} from '../../../../components/cabinet/ui';
import { CONTACT_LABEL } from '../../../../lib/cabinet/channels';
import { staffThreads } from '../../../../lib/cabinet/messages';
import { TOOLS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { requireActor } from '../../../../lib/cabinet/session';
import { contactLabelFor } from '../../../../lib/cabinet/staff-texts';
import { teamLoad, type TeamPoint } from '../../../../lib/cabinet/team';
import { assignmentLoad } from '../../../../lib/cabinet/assignments';
import { MONTH_NAMES } from '../../../../lib/cabinet/analytics/calendar';

export const dynamic = 'force-dynamic';

/** Где стоят работы — строкой: «в работе 2 · ждут клиента 1». */
const where = (points: readonly TeamPoint[]): string =>
  points.length === 0 ? '—' : points.map((point) => `${point.label.toLowerCase()} ${point.count}`).join(' · ');

/** Число в клетке: ноль — прочерком, чтобы ненулевое читалось сразу. */
const num = (value: number): string => (value === 0 ? '—' : String(value));

/**
 * «Управление → Команда» (требования РК-06 и РК-07).
 *
 * Вкладка «Люди» — кто чем занят: менеджеры и кураторы, строка на
 * человека, имя ведёт в «Работы» с отбором по нему (решение Р-343).
 * Вкладка «Переписка» — ветки «руководитель — сотрудник», непрочитанные
 * сверху (решение Р-336).
 */
export default async function TeamScreen({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor('/cabinet/manage/team');
  if (actor.role !== 'HEAD') redirect(homeFor(actor));
  const tab = (await searchParams).tab === 'threads' ? 'threads' : 'people';
  const threads = await staffThreads(actor);
  const unread = threads.reduce((acc, row) => acc + row.unread, 0);
  const team = tab === 'people' ? await teamLoad(actor) : { managers: [], curators: [], peak: null };
  // Ближайший пик сдачи — колонка куратора «К пику» (РК-22, Р-354).
  const peakLabel = team.peak === null ? null : `${MONTH_NAMES[team.peak.month - 1]} ${team.peak.year}`;
  // Поручения: открытые и просроченные по исполнителю (РК-19, Р-352).
  const given = tab === 'people' ? await assignmentLoad(actor) : new Map<string, { open: number; overdue: number }>();
  const assigned = (id: string) => {
    const cell = given.get(id);
    return cell === undefined ? '—' : `${cell.open}${cell.overdue === 0 ? '' : ` (просрочено ${cell.overdue})`}`;
  };

  return (
    <Shell actor={actor} current={TOOLS_HREF}>
      <ScreenHead backHref={TOOLS_HREF} backLabel="Управление" title="Команда" note="кто чем занят и переписка с менеджерами" />
      <Tabs
        label="Разделы команды"
        items={[
          { href: '/cabinet/manage/team', label: 'Люди', active: tab === 'people' },
          {
            href: '/cabinet/manage/team?tab=threads',
            label: unread === 0 ? 'Переписка' : `Переписка · ${unread}`,
            active: tab === 'threads',
          },
        ]}
      />

      {tab === 'threads' ? (
        <Narrow width={780}>
          <Card>
            <Heading level={2} size={3} style={{ marginBottom: 12 }}>
              Переписка
            </Heading>
            {threads.length === 0 ? (
              <Text muted>Действующих менеджеров нет.</Text>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
                {threads.map((row) => (
                  <li key={row.staffId}>
                    <a className="cab-mark" href={`/cabinet/manage/team/${row.staffId}`}>
                      {row.fullName}
                    </a>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {row.unread > 0
                        ? `новых сообщений: ${row.unread}`
                        : row.lastAt === null
                          ? 'переписки пока нет'
                          : `последнее сообщение — ${formatDay(row.lastAt)}`}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Narrow>
      ) : (
        <>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Менеджеры
          </Heading>
          <TableCard label="Менеджеры" style={{ marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Менеджер</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Работ</th>
                  <th style={TABLE_HEAD} scope="col">Где стоят</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Просрочено</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Клиент ждёт ответа</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Ждёт публикации</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Сдано, ждёт решения</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Поручения</th>
                </tr>
              </thead>
              <tbody>
                {team.managers.length === 0 ? (
                  <tr>
                    <td style={TABLE_CELL} colSpan={8}>
                      Действующих менеджеров нет.
                    </td>
                  </tr>
                ) : (
                  team.managers.map((row) => (
                    <tr key={row.id}>
                      <td style={TABLE_CELL}>
                        <a className="cab-mark" href={row.href}>
                          {row.fullName}
                        </a>
                        {row.role === 'HEAD' ? ' · руководитель' : ''}
                      </td>
                      <td style={TABLE_NUM}>
                        {row.works}
                        {row.paused === 0 ? '' : ` (приост. ${row.paused})`}
                      </td>
                      <td style={TABLE_CELL}>{where(row.points)}</td>
                      <td style={TABLE_NUM}>{num(row.overdue)}</td>
                      <td style={TABLE_NUM}>{num(row.clientWaiting)}</td>
                      <td style={TABLE_NUM}>{num(row.moderation)}</td>
                      <td style={TABLE_NUM}>{num(row.handedOver)}</td>
                      <td style={TABLE_NUM}>{assigned(row.id)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
          <Text muted size={13} style={{ marginBottom: 24 }}>
            Работы — действующие, идущие и приостановленные. Где стоят — по текущему этапу. Клиент
            ждёт ответа, ждёт публикации и сдано куратором — дела менеджера без срока реакции; те
            же дела после срока — «Контроль» на «Сводке».
          </Text>

          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Кураторы
          </Heading>
          <TableCard label="Кураторы" style={{ marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={TABLE_HEAD} scope="col">Куратор</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Работ</th>
                  <th style={TABLE_HEAD} scope="col">Где стоят</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Просрочено</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Его дела</th>
                  <th style={TABLE_HEAD} scope="col">Договор поручения</th>
                  <th style={TABLE_HEAD} scope="col">Связь</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">Поручения</th>
                  <th style={{ ...TABLE_HEAD, textAlign: 'right' }} scope="col">
                    {peakLabel === null ? 'К пику сдачи' : `К пику: ${peakLabel}`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.curators.length === 0 ? (
                  <tr>
                    <td style={TABLE_CELL} colSpan={9}>
                      Действующих кураторов нет.
                    </td>
                  </tr>
                ) : (
                  team.curators.map((row) => (
                    <tr key={row.id}>
                      <td style={TABLE_CELL}>
                        <a className="cab-mark" href={row.href}>
                          {row.fullName}
                        </a>
                      </td>
                      <td style={TABLE_NUM}>
                        {row.works}
                        {row.paused === 0 ? '' : ` (приост. ${row.paused})`}
                      </td>
                      <td style={TABLE_CELL}>{where(row.points)}</td>
                      <td style={TABLE_NUM}>{num(row.overdue)}</td>
                      <td style={TABLE_NUM}>{num(row.decide)}</td>
                      <td style={TABLE_CELL}>
                        {row.ndaSignedAt === null ? (
                          <Chip>не подписан</Chip>
                        ) : (
                          <Chip>подписан {formatDate(row.ndaSignedAt)}</Chip>
                        )}
                      </td>
                      <td style={TABLE_CELL}>
                        {row.contact === null
                          ? '—'
                          : `${contactLabelFor('EXPERT', row.contact.kind, CONTACT_LABEL)}${
                              row.contact.value === null ? '' : ` — ${row.contact.value}`
                            }`}
                      </td>
                      <td style={TABLE_NUM}>{assigned(row.id)}</td>
                      <td style={TABLE_NUM}>
                        {team.peak === null || row.peakWorks === 0 ? (
                          num(row.peakWorks)
                        ) : (
                          <a className="cab-mark" href={`/cabinet/projects?state=active&curator=${row.id}&due=${team.peak.key}`}>
                            {row.peakWorks}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
          <Text muted size={13}>
            Его дела — то, что куратор видит в «Что сделать сейчас». Связь — предпочтительный способ
            из его настроек; без действующих работ не показывается. К пику — действующие работы со
            сроком в ближайшем месяце сдачи по «Календарю продвижения» (виды с уверенностью не ниже
            «предположительно»).
          </Text>
        </>
      )}
    </Shell>
  );
}
