import { flashText } from '../../../lib/cabinet/flash';
import { redirect } from 'next/navigation';

import Shell from '../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Disclosure,
  Field,
  Form,
  FormActions,
  Heading,
  Narrow,
  Notice,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  Text,
  formatDate,
  TableScroll,
} from '../../../components/cabinet/ui';
import { telegramBindAvailable } from '../../../lib/cabinet/auth';
import { ownChannels } from '../../../lib/cabinet/admin';
import {
  CONTACT_LABEL,
  CONTACT_NOTE,
  RULE_EVENTS,
  needsValue,
  ownContacts,
  ownRules,
  type ContactKind,
} from '../../../lib/cabinet/channels';
import { currentActor } from '../../../lib/cabinet/session';
import {
  addContactChannel,
  dropTelegram,
  makeContactPreferred,
  removeContactChannel,
  saveNotificationChannels,
  saveNotifyRules,
  startTelegramBind,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function SettingsScreen({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const [params, user, contacts, rules] = await Promise.all([
    searchParams,
    ownChannels(actor),
    ownContacts(actor),
    ownRules(actor),
  ]);
  // Причина отказа — по метке из одноразовой cookie, не из адреса (Р-243).
  const failure = await flashText(params.error);

  // Разбор по событиям нужен тому, кто получает уведомления обо всей
  // практике: у клиента их несколько в месяц, и делить их по каналам
  // незачем (решение Р-198).
  const withRules = actor.role === 'HEAD' || actor.role === 'MANAGER';
  const ruleOn = (kind: string, channel: 'EMAIL' | 'TELEGRAM'): boolean => {
    const exact = rules.find((rule) => rule.eventKind === kind && rule.channel === channel);
    return exact === undefined ? true : exact.enabled;
  };

  const bound = user.telegramChatId !== null;
  // Ссылка привязки заводится нажатием, а не при каждом открытии экрана:
  // прежде каждое открытие и каждое «Сохранить» писали в базу новую
  // живую метку (решение Р-245).
  const mayBind = !bound && telegramBindAvailable();

  return (
    <Shell actor={actor} current="/cabinet/settings">
      <Narrow width={680}>
        <ScreenHead title="Как сообщать о ходе работы" />
        <Text style={{ marginBottom: 24 }}>
          Уведомления приходят о том, что требует действия: этап ждёт материалов, материал готов к
          согласованию, приближается срок. Содержание переписки наружу не пересылается.
        </Text>

        {failure === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice tone="error" role="alert">{failure}</Notice>
          </div>
        )}

        {params.saved === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice>Настройки сохранены.</Notice>
          </div>
        )}

        {/* Способ связи — не канал доставки: звонить и писать в соцсети
            приложение не умеет, это делает куратор. Здесь человек говорит,
            как ему удобно, и куратор так и поступает (решение Р-198). */}
        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Как с вами связываться
          </Heading>
          <Text muted size={14} style={{ marginBottom: 16 }}>
            Куратор видит этот список и держится его. Отметьте предпочтительный способ — с него
            и начнут.
          </Text>

          {contacts.length === 0 ? (
            <Text muted style={{ marginBottom: 16 }}>
              Способ связи не указан — куратор будет писать на почту учётной записи.
            </Text>
          ) : (
            <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--pd-divider)',
                  }}
                >
                  <div style={{ flex: '1 1 260px' }}>
                    <Text size={15}>
                      {CONTACT_LABEL[contact.kind as ContactKind]}
                      {contact.value === null ? '' : ` — ${contact.value}`}
                    </Text>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {contact.note ?? CONTACT_NOTE[contact.kind as ContactKind]}
                    </Text>
                  </div>
                  {contact.preferred ? (
                    <Chip>предпочтительный</Chip>
                  ) : (
                    <Form action={makeContactPreferred} inline>
                      <input type="hidden" name="id" value={contact.id} />
                      <Button tone="quiet">Сделать основным</Button>
                    </Form>
                  )}
                  <Form action={removeContactChannel} inline>
                    <input type="hidden" name="id" value={contact.id} />
                    <Button tone="quiet">Убрать</Button>
                  </Form>
                </li>
              ))}
            </ul>
          )}

          <Disclosure title="Добавить способ связи">
            <Form action={addContactChannel}>
              <Select label="Способ" name="kind">
                {(Object.keys(CONTACT_LABEL) as ContactKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {CONTACT_LABEL[kind]}
                  </option>
                ))}
              </Select>
              <Field
                label="Номер или ссылка"
                name="value"
                hint="Нужно для звонка и мессенджера: телефон либо ссылка или имя в сети."
                placeholder="+7 900 000-00-00 либо @имя"
              />
              <Field
                label="Оговорка"
                name="note"
                hint="Когда удобно и когда не стоит: «звонить после 18:00», «в выходные не писать»."
                placeholder="Звонить после 18:00"
              />
              <Checkbox name="preferred" label="Это предпочтительный способ" />
              <FormActions>
                <Button>Добавить</Button>
              </FormActions>
            </Form>
          </Disclosure>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Куда слать уведомления
          </Heading>
          <Text muted size={14} style={{ marginBottom: 16 }}>
            Это то, что система шлёт сама. Звонки и сообщения в сетях делает куратор — их здесь
            нет.
          </Text>
          <Form action={saveNotificationChannels}>
            <Checkbox
              name="notifyEmail"
              defaultChecked={user.notifyEmail}
              label={
                <>
                  Электронная почта — <strong>{user.email}</strong>
                </>
              }
            />
            <Checkbox
              name="notifyTelegram"
              defaultChecked={user.notifyTelegram}
              disabled={!bound}
              label={`Telegram${bound ? '' : ' — сначала привяжите аккаунт'}`}
            />
            <FormActions>
              <Button>Сохранить</Button>
            </FormActions>
          </Form>
        </Card>

        {!withRules ? null : (
          <Card style={{ marginBottom: 20 }}>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Какое событие каким каналом
            </Heading>
            <Text muted size={14} style={{ marginBottom: 16 }}>
              Уведомлений о практике много; срочное удобно получать в Telegram, а остальное —
              письмом. Снятая всюду строка означает, что о таком событии не сообщать вовсе.
            </Text>
            <Form action={saveNotifyRules}>
              <TableScroll label="Какое событие каким каналом">
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th scope="col" style={TABLE_HEAD}>
                      Событие
                    </th>
                    <th scope="col" style={TABLE_HEAD}>
                      Почта
                    </th>
                    <th scope="col" style={TABLE_HEAD}>
                      Telegram
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RULE_EVENTS.map((event) => (
                    <tr key={event.kind}>
                      <td style={TABLE_CELL}>{event.title}</td>
                      {(['EMAIL', 'TELEGRAM'] as const).map((channel) => (
                        <td key={channel} style={TABLE_CELL}>
                          <Checkbox
                            name={`rule:${event.kind}:${channel}`}
                            defaultChecked={ruleOn(event.kind, channel)}
                            label={channel === 'EMAIL' ? 'письмом' : 'в Telegram'}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
              <FormActions>
                <Button>Сохранить правила</Button>
              </FormActions>
            </Form>
          </Card>
        )}

        <Card>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Telegram
          </Heading>
          {bound ? (
            <>
              <Text style={{ marginBottom: 16 }}>Аккаунт привязан, уведомления доходят.</Text>
              <Form action={dropTelegram} inline>
                <Button tone="quiet">Отвязать</Button>
              </Form>
            </>
          ) : !mayBind ? (
            <Text muted>
              Канал не настроен на стороне сервиса. Пока уведомления приходят только почтой.
            </Text>
          ) : (
            <>
              <Text style={{ marginBottom: 16 }}>
                Нажмите кнопку — откроется бот; нажмите в нём «Начать», и он запомнит, куда
                присылать уведомления. Ссылка действует час и срабатывает один раз; войти по ней в
                кабинет нельзя.
              </Text>
              <Form action={startTelegramBind} inline>
                <Button>Привязать Telegram</Button>
              </Form>
            </>
          )}
        </Card>

        {user.consentAcceptedAt === null ? null : (
          <Text muted size={13} style={{ marginTop: 24 }}>
            Согласие на обработку персональных данных принято{' '}
            {formatDate(user.consentAcceptedAt)}. Отозвать его и потребовать удаления данных
            можно письмом менеджеру.
          </Text>
        )}
      </Narrow>
    </Shell>
  );
}
