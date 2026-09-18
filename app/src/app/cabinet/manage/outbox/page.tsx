import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Empty,
  Heading,
  Mono,
  TABLE_CELL,
  TABLE_HEAD,
  Text,
  Tile,
  Tiles,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { formatMoment } from '../../../../lib/cabinet/journals';
import { CHANNEL_OFF, outboxDigest } from '../../../../lib/cabinet/outbox';
import { currentActor } from '../../../../lib/cabinet/session';
import { retryNotification } from '../../actions';

export const dynamic = 'force-dynamic';

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'письмо',
  TELEGRAM: 'Telegram',
};

const EVENT_LABEL: Record<string, string> = {
  STAGE_AWAITING_CLIENT: 'этап ждёт клиента',
  VERSION_UPLOADED: 'загружена версия',
  EXPERT_COMMENT_PUBLISHED: 'опубликовано замечание',
  STAGE_IN_APPROVAL: 'этап на согласовании',
  DEADLINE_IN_3_DAYS: 'приближается срок',
  PAYMENT_STATUS_CHANGED: 'изменилась оплата',
  REQUEST_CREATED: 'новая заявка',
};

export default async function OutboxScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Состояние очереди — служебная кухня практики; менеджеру она не нужна.
  if (!can(actor, 'AUDIT_VIEW')) redirect('/cabinet/projects');

  const digest = await outboxDigest(actor);

  return (
    <Shell actor={actor} current="/cabinet/manage/outbox">
      <Mono>Уведомления</Mono>
      <Heading level={1} style={{ margin: '12px 0 20px' }}>
        Очередь отправки
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
        <Card style={{ padding: 0, overflowX: 'auto' }}>
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
                    {EVENT_LABEL[row.eventKind] ?? row.eventKind}
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.subject}
                      {row.projectCode === null ? null : ` · ${row.projectCode}`}
                    </div>
                  </td>
                  <td style={TABLE_CELL}>{row.recipient}</td>
                  <td style={TABLE_CELL}>
                    <Chip>{CHANNEL_LABEL[row.channel] ?? row.channel}</Chip>
                  </td>
                  <td style={TABLE_CELL}>{row.attempts}</td>
                  <td style={TABLE_CELL}>
                    <Text muted style={{ margin: 0 }}>
                      {row.lastError ?? 'причина не записана'}
                    </Text>
                  </td>
                  <td style={TABLE_CELL}>
                    <form action={retryNotification}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button tone="quiet">Отправить ещё раз</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Text muted style={{ marginTop: 20 }}>
        Причина «{CHANNEL_OFF}» означает, что почтовый ящик или бот ещё не заданы: такие
        уведомления попыток не расходуют и уйдут сами, когда настройки появятся.
      </Text>
    </Shell>
  );
}
