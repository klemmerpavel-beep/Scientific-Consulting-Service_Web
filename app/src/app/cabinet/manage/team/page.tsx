import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { Card, Heading, Narrow, ScreenHead, Text, formatDate } from '../../../../components/cabinet/ui';
import { staffThreads } from '../../../../lib/cabinet/messages';
import { TOOLS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { requireActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * «Управление → Команда» (требования РК-07 и РК-06). Раздел «Переписка» —
 * ветки «руководитель — сотрудник», непрочитанные сверху (решение Р-336).
 */
export default async function TeamScreen() {
  const actor = await requireActor('/cabinet/manage/team');
  if (actor.role !== 'HEAD') redirect(homeFor(actor));
  const threads = await staffThreads(actor);

  return (
    <Shell actor={actor} current={TOOLS_HREF}>
      <Narrow width={780}>
        <ScreenHead backHref={TOOLS_HREF} backLabel="Управление" title="Команда" note="кто чем занят и переписка с менеджерами" />
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
                        : `последнее сообщение — ${formatDate(row.lastAt)}`}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Narrow>
    </Shell>
  );
}
