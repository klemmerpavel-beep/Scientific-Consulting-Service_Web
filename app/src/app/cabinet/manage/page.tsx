import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import { SANS } from '../../../components/cabinet/tokens';
import {
  Board,
  BoardColumn,
  ScreenHead,
  Text,
  Tile,
  Tiles,
  formatDate,
} from '../../../components/cabinet/ui';
import { can } from '../../../lib/cabinet/access';
import { leadSourceLabel } from '../../../lib/cabinet/lead-labels';
import { formatAmount, formatPlain } from '../../../lib/cabinet/money';
import { unreadInbox } from '../../../lib/cabinet/messages';
import { leadQueue, trafficLight } from '../../../lib/cabinet/queries';
import { outboxDigest } from '../../../lib/cabinet/outbox';
import { currentActor } from '../../../lib/cabinet/session';
import { OVERHEAD_PERCENT, activeWorks, practiceSummary } from '../../../lib/cabinet/summary';
export const dynamic = 'force-dynamic';

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
  // Состояние очереди уведомлений видит только руководитель (решение Р-154):
  // менеджеру служебная кухня не нужна, а недоставленное письмо — забота
  // того, кто отвечает за практику целиком.
  const outbox = can(actor, 'AUDIT_VIEW') ? await outboxDigest(actor) : null;

  // «Требует внимания» — то, что нельзя оставить как есть: сорванный срок,
  // работа, которая ждёт клиента дольше двух недель, и непрочитанное
  // сообщение. У менеджера это главный экран целиком, у руководителя —
  // раздел под сводкой (решение Р-149).
  const attention = [
    ...light.overdue.map((stage: (typeof light.overdue)[number]) => ({
      key: `overdue-${stage.id}`,
      what: 'Сорван срок этапа',
      detail: `${stage.title} · ${stage.project.code} · ${stage.project.client.fullName}`,
      when: stage.dueOn === null ? null : `срок ${formatDate(stage.dueOn)}`,
      href: `/cabinet/stages/${stage.id}`,
    })),
    ...light.stalled.map((stage: (typeof light.stalled)[number]) => ({
      key: `stalled-${stage.id}`,
      what: 'Ждёт клиента дольше двух недель',
      detail: `${stage.title} · ${stage.project.code} · ${stage.project.client.fullName}`,
      when:
        stage.awaitingClientSince === null
          ? null
          : `с ${formatDate(stage.awaitingClientSince)}`,
      href: `/cabinet/stages/${stage.id}`,
    })),
    ...unread.map((row) => ({
      key: `unread-${row.code}`,
      what: `Непрочитанных сообщений: ${row.count}`,
      detail: `${row.title} · ${row.code}`,
      when: null,
      href: `/cabinet/projects/${row.code}/messages`,
    })),
    ...(outbox !== null && outbox.failed > 0
      ? [
          {
            key: 'outbox',
            what: `Уведомления не доставлены: ${outbox.failed}`,
            detail: 'Письма и сообщения, не ушедшие после пяти попыток',
            when: null,
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

      {/* Доли ширины неравные: у «Заявок» строка короткая, а в двух
          других колонках при равной трети рвались слова — «Подготовка / к
          предзащите» (решение Р-175). Колонки сжимаются по содержимому:
          прежде колонка с одной строкой держала пустое поле до низа окна. */}
      <Board columns={works.length === 0 ? 2 : 3} weights={works.length === 0 ? [1.3, 1] : [1.15, 1.15, 0.7]}>
        <BoardColumn title="Требует внимания" fit>
          {attention.length === 0 ? (
            <Text muted>Сейчас ничего не требует вмешательства.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {attention.map((row) => (
                <li key={row.key} style={{ display: 'grid', gap: 2 }}>
                  {/* Ведёт сама запись: отдельная строка «Открыть» под
                      каждой занимала 44 пикселя и вела туда же. */}
                  <a
                    href={row.href}
                    style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}
                  >
                    {row.what}
                  </a>
                  <Text muted size={13}>
                    {row.detail}
                    {row.when === null ? '' : ` · ${row.when}`}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </BoardColumn>

        {works.length === 0 ? null : (
          <BoardColumn
            title={summary === null ? 'Мои работы' : 'Сейчас в работе'}
            href="/cabinet/projects"
            hrefLabel="все работы"
            fit
          >
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {works.map((work) => (
                <li key={work.code} style={{ display: 'grid', gap: 2 }}>
                  <a href={`/cabinet/projects/${work.code}`} style={{ fontFamily: SANS, fontSize: 14 }}>
                    {work.title}
                  </a>
                  <Text muted size={13}>
                    {work.code} · {work.client}
                    {work.stage === null ? '' : ` · ${work.stage}`}
                  </Text>
                  <Text muted size={13}>
                    {work.contracted === null
                      ? work.dueOn === null
                        ? 'срок не назначен'
                        : `срок ${formatDate(work.dueOn)}`
                      : `${formatPlain(work.contracted)} ₽ по договору${
                          work.outstanding !== null && work.outstanding > 0n
                            ? ` · ${formatPlain(work.outstanding)} ₽ не оплачено`
                            : ' · оплачено полностью'
                        }${work.dueOn === null ? '' : ` · срок ${formatDate(work.dueOn)}`}`}
                  </Text>
                </li>
              ))}
            </ul>
          </BoardColumn>
        )}

        <BoardColumn
          title="Заявки"
          href={queue.total > 0 ? '/cabinet/manage/leads' : undefined}
          hrefLabel="все обращения"
          fit
        >
          {leads.length === 0 ? (
            <Text muted>Новых заявок нет.</Text>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
              {leads.map((lead) => (
                <li key={lead.id} style={{ display: 'grid', gap: 2 }}>
                  <a
                    href={`/cabinet/manage/leads/${lead.id}`}
                    style={{ fontFamily: SANS, fontSize: 14 }}
                  >
                    {lead.name ?? 'Без имени'}
                  </a>
                  <Text muted size={13}>
                    {leadSourceLabel(lead.source)} · {formatDate(lead.createdAt)}
                    {lead.topic === null ? '' : ` · ${lead.topic}`}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </BoardColumn>
      </Board>
    </Shell>
  );
}
