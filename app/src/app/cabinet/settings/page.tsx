import { Fragment } from 'react';
import { flashText } from '../../../lib/cabinet/flash';

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
  Outcome,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  Text,
  formatDate,
  TableScroll,
} from '../../../components/cabinet/ui';
import { telegramBindAvailable } from '../../../lib/cabinet/auth';
import { ownChannels, ownCuratorProfile } from '../../../lib/cabinet/admin';
import { CURATOR_FOR_CLIENT, expertLine } from '../../../lib/cabinet/access';
import {
  CONTACT_LABEL,
  CONTACT_NOTE,
  rulesFor,
  needsValue,
  ownContacts,
  ownRules,
  type ContactKind,
} from '../../../lib/cabinet/channels';
import {
  contactKindsFor,
  contactLabelFor,
  contactNoteFor,
  settingsTexts,
} from '../../../lib/cabinet/staff-texts';
import { requireActor } from '../../../lib/cabinet/session';
import { PRACTICE_EMAIL } from '../../../lib/practice-contacts';
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
  const actor = await requireActor('/cabinet/settings');

  const [params, user, contacts, rules, profile] = await Promise.all([
    searchParams,
    ownChannels(actor),
    ownContacts(actor),
    ownRules(actor),
    ownCuratorProfile(actor),
  ]);
  // Причина отказа — по метке из одноразовой cookie, не из адреса (Р-243).
  const failure = await flashText(params.error);

  // Разбор по событиям нужен тому, кто получает уведомления обо всей
  // практике: у клиента их несколько в месяц, и делить их по каналам
  // незачем (решение Р-198).
  // Куратору — строки его работ (требование Э-09, решение Р-328).
  const withRules = actor.role === 'HEAD' || actor.role === 'MANAGER' || actor.role === 'EXPERT';
  // Тексты экрана — по роли: менеджеру не пишут как клиенту (требование
  // М-20, решение Р-306).
  const texts = settingsTexts(actor.role);
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
        {/* «Настройки» — как пункт меню; подзаголовок говорит, о чём экран
            (требование Т-08, решение Р-314). */}
        <ScreenHead title="Настройки" note="Как сообщать о ходе работы" />
        <Text style={{ marginBottom: 24 }}>{texts.lead}</Text>

        {failure === undefined ? null : (
          <Outcome tone="error">{failure}</Outcome>
        )}

        {params.saved === undefined ? null : (
          <Outcome>Настройки сохранены.</Outcome>
        )}

        {/* Профиль куратора — только чтение: регалии ведёт руководитель
            (Э-11). Строка «Так вас видит клиент» собирается той же
            функцией, что строка клиента в «О работе» (требование Э-10,
            решение Р-330). */}
        {actor.role !== 'EXPERT' ? null : (
          <Card style={{ marginBottom: 20 }}>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Мой профиль
            </Heading>
            <Text muted size={14} style={{ marginBottom: 16 }}>
              Профиль ведёт руководитель практики: если что-то указано неверно, напишите ему.
            </Text>
            <dl style={{ margin: '0 0 16px', display: 'grid', gap: 10 }}>
              {[
                { term: 'Учёная степень', value: profile?.degree },
                { term: 'Учёное звание', value: profile?.academicTitle },
                { term: 'Должность', value: profile?.position },
                {
                  term: 'Научная специальность',
                  value: [profile?.specialtyCode, profile?.specialization].filter(Boolean).join(' — '),
                },
                { term: 'Вуз', value: profile?.university },
                {
                  term: 'Договор поручения',
                  value:
                    profile?.ndaSignedAt == null
                      ? 'не отмечен — материалы клиентов закрыты'
                      : `отмечен ${formatDate(profile.ndaSignedAt)}`,
                },
              ].map((row) => (
                <div
                  key={row.term}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0,170px) minmax(0,1fr)', gap: 14 }}
                >
                  <dt style={{ margin: 0 }}>
                    <Text muted size={13}>
                      {row.term}
                    </Text>
                  </dt>
                  <dd style={{ margin: 0 }}>
                    <Text size={14}>{row.value || 'не указано'}</Text>
                  </dd>
                </div>
              ))}
            </dl>
            <Text size={14}>
              {`Так вас видит клиент: ${[CURATOR_FOR_CLIENT, expertLine(profile ?? null)].filter(Boolean).join(', ')}.`}
            </Text>
          </Card>
        )}

        {/* Способ связи — не канал доставки: звонить и писать в соцсети
            приложение не умеет, это делает куратор. Здесь человек говорит,
            как ему удобно, и куратор так и поступает (решение Р-198). */}
        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Как с вами связываться
          </Heading>
          <Text muted size={14} style={{ marginBottom: 16 }}>
            {texts.contactsLead}
          </Text>

          {contacts.length === 0 ? (
            <Text muted style={{ marginBottom: 16 }}>
              {texts.contactsEmpty}
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
                      {contactLabelFor(actor.role, contact.kind as ContactKind, CONTACT_LABEL)}
                      {contact.value === null ? '' : ` — ${contact.value}`}
                    </Text>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {contact.note ?? contactNoteFor(actor.role, contact.kind as ContactKind, CONTACT_NOTE)}
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
                {contactKindsFor(actor.role, Object.keys(CONTACT_LABEL) as ContactKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {contactLabelFor(actor.role, kind, CONTACT_LABEL)}
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
            {texts.deliveryLead}
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
              {actor.role === 'EXPERT'
                ? 'Уведомления о ваших работах: срочное удобно получать в Telegram, а остальное — письмом. '
                : 'Уведомлений о практике много; срочное удобно получать в Telegram, а остальное — письмом. '}
              Снятая всюду строка означает, что о таком событии не сообщать вовсе.
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
                  {/* Строки — по роли и группами: менеджеру не показываются
                      события, которые ему не приходят (М-07, Р-300). */}
                  {rulesFor(actor.role).map((event, index, rows) => (
                    <Fragment key={event.kind}>
                    {index === 0 || rows[index - 1]!.group !== event.group ? (
                      <tr>
                        <th scope="row" colSpan={3} style={{ ...TABLE_CELL, fontWeight: 600 }}>
                          {event.group}
                        </th>
                      </tr>
                    ) : null}
                    <tr>
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
                    </Fragment>
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
            {formatDate(user.consentAcceptedAt)}. {texts.consentTail}{' '}
            <a className="cab-mark" href={`mailto:${PRACTICE_EMAIL}`}>
              {PRACTICE_EMAIL}
            </a>
            .
          </Text>
        )}
      </Narrow>
    </Shell>
  );
}
