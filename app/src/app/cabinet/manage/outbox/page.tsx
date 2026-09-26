import {
  redirect } from 'next/navigation';  import Shell from '../../../../components/cabinet/Shell'; import {   Button,
  Card,
  Chip,
  Empty,
  Form,
  Heading,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  TABLE_NUM,
  Text,
  Tile,
  Tiles,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { formatMoment } from '../../../../lib/cabinet/journals';
import { leadSourceLabel } from '../../../../lib/cabinet/lead-labels';
import {
  CHANNEL_OFF,
  eventLabel,
  leadDeliveryDigest,
  outboxDigest,
} from '../../../../lib/cabinet/outbox';
import { currentActor } from '../../../../lib/cabinet/session';
import { retryNotification } from '../../actions';
import ActionError from '../../../../components/cabinet/ActionError';

export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'письмо',
  TELEGRAM: 'Telegram',
};

export default async function OutboxScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Состояние очереди — служебная кухня практики; менеджеру она не нужна.
  if (!can(actor, 'AUDIT_VIEW')) redirect('/cabinet/projects');

  const [digest, leads] = await Promise.all([outboxDigest(actor), leadDeliveryDigest(actor)]);

  return (
    <Shell actor={actor} current="/cabinet/manage/outbox">
      <ScreenHead
        title="Очередь отправки"
        note="Два разных пути. Уведомления кабинета копятся в очереди и уходят рассылкой раз в минуту. Обращения с сайта не ждут очереди: их отправляет сам приём заявки, а исход записывает в журнал доставки — он ниже."
      />

      <ActionError id={(await searchParams).error} />

      <Heading level={2} style={{ margin: '0 0 12px' }}>
        Уведомления кабинета
      </Heading>

      <Tiles>
        <Tile
          label="Ждут отправки"
          value={String(digest.pending)}
          note={
            digest.waitingChannel > 0
              ? `из них ${digest.waitingChannel} ждут настройки канала`
              : 'уйдут ближайшей рассылкой'
          }
        />
        <Tile
          label="Ушло за сутки"
          value={String(digest.sentLastDay)}
          note={
            digest.lastSentAt === null
              ? 'отправок не было'
              : `последняя ${formatMoment(digest.lastSentAt)}`
          }
        />
        <Tile
          label="Не доставлено"
          value={String(digest.failed)}
          note="после пяти попыток"
        />
      </Tiles>

      <Heading level={2} style={{ margin: '36px 0 12px' }}>
        Не доставлено
      </Heading>

      {digest.failures.length === 0 ? (
        <Empty title="Недоставленных нет">
          {digest.waitingChannel > 0
            ? 'Часть уведомлений ждёт, пока будут заданы настройки канала.'
            : undefined}
        </Empty>
      ) : (
        <TableCard label="Недоставленные уведомления">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Событие</th>
                <th style={TABLE_HEAD} scope="col">Кому</th>
                <th style={TABLE_HEAD} scope="col">Канал</th>
                <th style={TABLE_HEAD} scope="col">Попыток</th>
                <th style={TABLE_HEAD} scope="col">Причина</th>
                <th style={TABLE_HEAD} scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {digest.failures.map((row) => (
                <tr key={row.id}>
                  <td style={TABLE_CELL}>
                    {eventLabel(row.eventKind)}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.subject}
                      {row.projectTitle === null ? null : ` · ${row.projectTitle}`}
                    </div>
                  </td>
                  <td style={TABLE_CELL}>{row.recipient}</td>
                  <td style={TABLE_CELL}>
                    <Chip>{CHANNEL_LABEL[row.channel] ?? row.channel}</Chip>
                  </td>
                  <td style={TABLE_NUM}>{row.attempts}</td>
                  <td style={TABLE_CELL}>
                    <Text muted style={{ margin: 0 }}>
                      {row.lastError ?? 'причина не записана'}
                    </Text>
                  </td>
                  <td style={TABLE_CELL}>
                    <Form action={retryNotification} inline>
                      <input type="hidden" name="id" value={row.id} />
                      <Button tone="quiet">Отправить ещё раз</Button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <Text muted style={{ marginTop: 20 }}>
        Причина «{CHANNEL_OFF}» означает, что почтовый ящик или бот ещё не заданы: такие
        уведомления попыток не расходуют и уйдут сами, когда настройки появятся.
      </Text>

      <Heading level={2} style={{ margin: '48px 0 12px' }}>
        Заявки с сайта
      </Heading>
      <Text muted style={{ marginBottom: 20 }}>
        Каждое обращение уходит сразу в оба канала — Telegram и почту. Повторов здесь нет:
        отказавшая доставка не повторяется, потому что сама заявка уже в базе и видна в разделе
        «Все заявки». Этот перечень отвечает на другой вопрос — работает ли канал.
      </Text>

      <Tiles>
        <Tile
          label="Заявок за сутки"
          value={String(leads.leadsLastDay)}
          note="сохранено в базе"
        />
        <Tile
          label="Доставок за сутки"
          value={String(leads.deliveredLastDay)}
          note={
            leads.lastOkAt === null
              ? 'доставок не было ни разу'
              : `последняя ${formatMoment(leads.lastOkAt)}`
          }
        />
        <Tile
          label="Не дошло за месяц"
          value={String(leads.failed)}
          note={
            leads.channelOff > 0
              ? `и ещё ${leads.channelOff} при незаданном канале`
              : 'каналы заданы'
          }
        />
      </Tiles>

      {leads.failures.length === 0 ? (
        <Card style={{ marginTop: 20 }}>
          <Text style={{ margin: 0 }}>
            {leads.channelOff > 0
              ? 'Отказов по существу нет. Часть обращений не доставлялась: канал ещё не задан — ' +
                'ни бот, ни почтовый ящик не настроены.'
              : 'Отказов за месяц нет.'}
          </Text>
        </Card>
      ) : (
        <TableCard label="Отказы по обращениям" style={{ marginTop: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Когда</th>
                <th style={TABLE_HEAD} scope="col">Заявка</th>
                <th style={TABLE_HEAD} scope="col">Канал</th>
                <th style={TABLE_HEAD} scope="col">Причина</th>
              </tr>
            </thead>
            <tbody>
              {leads.failures.map((row) => (
                <tr key={row.id}>
                  <td style={TABLE_CELL}>{formatMoment(row.createdAt)}</td>
                  <td style={TABLE_CELL}>
                    {leadSourceLabel(row.leadSource)}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.leadTopic ?? 'тема не указана'}
                    </div>
                  </td>
                  <td style={TABLE_CELL}>
                    <Chip>{CHANNEL_LABEL[row.channel.toUpperCase()] ?? row.channel}</Chip>
                  </td>
                  <td style={{ ...TABLE_CELL, maxWidth: 320, wordBreak: 'break-word' }}>
                    <Text muted style={{ margin: 0 }}>
                      {row.error ?? 'причина не записана'}
                    </Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      <Text muted size={13} style={{ marginTop: 12 }}>
        Показаны отказы за тридцать дней, не более двадцати строк. Имя и контакт заявителя
        в служебный перечень не выносятся — для разбора отказа довольно страницы и темы.
      </Text>
    </Shell>
  );
}
