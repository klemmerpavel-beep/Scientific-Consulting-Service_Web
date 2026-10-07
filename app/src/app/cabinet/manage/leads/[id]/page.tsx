import { notFound } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  Disclosure,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Narrow,
  Outcome,
  ScreenHead,
  Select,
  Text,
  formatDay,
  formatSize,
} from '../../../../../components/cabinet/ui';
import { ensure } from '../../../../../lib/cabinet/access';
import { contactHref, leadSourceLabel } from '../../../../../lib/cabinet/lead-labels';
import { declineLetterNote, leadAddress } from '../../../../../lib/cabinet/lead-letter';
import { curators, leadById, serviceTypes } from '../../../../../lib/cabinet/queries';
import { requireActor } from '../../../../../lib/cabinet/session';
import { commentLead, moderateLead, resendDeclineLetter, saveLead, switchLeadStatus } from '../../../actions';
import { LeadStatusChip, LeadStatusSwitch } from '../../../../../components/cabinet/LeadStatus';

export const dynamic = 'force-dynamic';

/**
 * Разбор одной заявки.
 *
 * Формы одобрения и отказа стояли в очереди на сводке — по две на каждую
 * заявку, со списком типов сопровождения и полем причины. Это около трёхсот
 * пикселей, повторённых столько раз, сколько заявок на странице, и именно
 * из-за них сводка не помещалась в окно (решение Р-172).
 *
 * Здесь обращение видно целиком: что человек написал, чем оставил контакт,
 * дал ли согласие на обработку.
 */
export default async function LeadScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; resent?: string }>;
}) {
  const actor = await requireActor(`/cabinet/manage/leads/${(await params).id}`);
  ensure(actor, 'REQUEST_MODERATE');

  const { id } = await params;
  const flags = await searchParams;
  const [lead, types] = await Promise.all([leadById(actor, id), serviceTypes(actor)]);
  if (lead === null) notFound();
  // Менеджера работы выбирает руководитель: единственный действующий
  // менеджер стоит по умолчанию, из нескольких выбор обязателен
  // (требование РК-08, решение Р-344; ДР-1, ОР-1).
  const managers = actor.role === 'HEAD' ? await curators(actor) : [];
  const onlyManager = managers.filter((row) => row.role === 'MANAGER');
  const managerDefault = onlyManager.length === 1 ? onlyManager[0]!.id : '';
  const letter = lead.notifications[0] ?? null;

  const callHref = contactHref(lead.contactKind, lead.contact);
  const extraHref = lead.phone === null ? null : contactHref('phone', lead.phone);

  const facts = [
    lead.supervisorName === null
      ? null
      : { term: 'Научный руководитель', value: lead.supervisorName },
    lead.organization === null ? null : { term: 'Организация или вуз', value: lead.organization },
    lead.speciality === null ? null : { term: 'Направление подготовки', value: lead.speciality },
    lead.phone === null ? null : { term: 'Контактный телефон', value: lead.phone },
    lead.deadline === null ? null : { term: 'Желаемый срок', value: lead.deadline },
  ].filter((fact) => fact !== null);

  return (
    <Shell actor={actor} current="/cabinet/manage/leads">
      <Narrow width={780}>
        <ScreenHead
          backHref="/cabinet/manage"
          backLabel="к сводке"
          title={lead.name ?? 'Заявка без имени'}
          chips={
            <>
              <Chip tone="accent">{leadSourceLabel(lead.source)}</Chip>
              <LeadStatusChip status={lead.status} />
            </>
          }
          note={`${lead.contactKind === 'email' ? 'Почта' : 'Телефон'}: ${lead.contact}`}
          aside={formatDay(lead.createdAt)}
        />

        <ActionError id={flags.error} />

        <Card style={{ marginBottom: 24 }}>
          {/* Связь в одно нажатие: сюда ведёт ссылка из сигнала в Telegram,
              и на телефоне звонок или письмо — одна кнопка (решение Р-276). */}
          {callHref === null && extraHref === null ? null : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              {callHref === null ? null : (
                <ButtonLink href={callHref} tone="primary">
                  {lead.contactKind === 'email' ? 'Написать' : 'Позвонить'}
                </ButtonLink>
              )}
              {extraHref === null ? null : (
                <ButtonLink href={extraHref}>Позвонить по доп. телефону</ButtonLink>
              )}
            </div>
          )}
          {lead.topic === null ? null : (
            <Text style={{ marginBottom: 12 }}>
              <strong style={{ fontWeight: 600 }}>Тема: </strong>
              {lead.topic}
            </Text>
          )}
          {lead.message === null ? (
            <Text muted>Обращение без текста: человек оставил только контакт.</Text>
          ) : (
            <Text style={{ whiteSpace: 'pre-wrap' }}>{lead.message}</Text>
          )}

          {/* Сведения, которые собирает заявка из кабинета: научный
              руководитель, место учёбы, телефон. У обращений с сайта их
              нет, и строка не печатается (решение Р-191). */}
          {facts.length === 0 ? null : (
            <dl
              style={{
                margin: '16px 0 0',
                paddingTop: 16,
                borderTop: '1px solid var(--pd-divider)',
                display: 'grid',
                gap: 10,
              }}
            >
              {/* Подпись и значение — строкой, пока значению хватает места,
                  и одно под другим на телефоне. Сетка с колонкой подписей
                  в 210 px оставляла значению на 390 px около 85 px, и
                  «университет» рвался посреди слова (решение Р-217). */}
              {facts.map((fact) => (
                <div
                  key={fact.term}
                  style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2 }}
                >
                  <dt style={{ margin: 0, flex: '0 0 210px', minWidth: 0 }}>
                    <Text muted size={13}>
                      {fact.term}
                    </Text>
                  </dt>
                  <dd style={{ margin: 0, flex: '1 1 240px', minWidth: 0 }}>
                    <Text size={14}>{fact.value}</Text>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {lead.attachments.length === 0 ? null : (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--pd-divider)' }}>
              <Text muted size={13} style={{ marginBottom: 8 }}>
                Приложено файлов: {lead.attachments.length}. После одобрения они перейдут в
                материалы работы.
              </Text>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                {lead.attachments.map((file) => (
                  <li key={file.id}>
                    <a
                      className="cab-mark"
                      href={`/cabinet/lead-files/${file.id}`}
                      style={{ fontSize: 14 }}
                    >
                      {file.originalName}
                    </a>
                    <Text muted size={13} style={{ marginTop: 2 }}>
                      {formatSize(file.sizeBytes)}
                    </Text>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Причина машинной пометки лежала в заметке заявки и не
              показывалась нигде: куратор не видел, почему заявка в спаме
              (решение Р-227). */}
          {lead.status === 'SPAM' ? (
            <Text muted size={13} style={{ marginTop: 16 }}>
              Помечена как машинная при приёме{lead.notes === null ? '.' : `: ${lead.notes}.`}
            </Text>
          ) : null}

          <Text muted size={13} style={{ marginTop: 16 }}>
            {lead.consentGiven
              ? 'Согласие на обработку персональных данных получено.'
              : 'Согласие на обработку персональных данных не отмечено.'}
          </Text>
        </Card>

        {/* Работа с заявкой до решения: состояние плашкой и внутренние
            комментарии — что сделано, о чём договорились, чего ждём
            (решение Р-270). Заявителю это не показывается. */}
        <Card style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 12 }}>
            Работа с заявкой
          </Heading>
          {lead.project === null ? (
            <>
              <LeadStatusSwitch
                current={lead.status}
                action={switchLeadStatus}
                hidden={<input type="hidden" name="leadId" value={lead.id} />}
              />
              <Text muted size={13} style={{ marginTop: 10 }}>
                Состояние меняется одним нажатием. «Договор заключён» ставит одобрение ниже — вместе
                с работой, «Отказ» — форма отказа с причиной.
              </Text>
            </>
          ) : (
            <Text muted size={13}>
              Заявка стала работой: дальше её ход ведётся в карточке работы.
            </Text>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--pd-divider)' }}>
            <Heading level={3} size={3} style={{ marginBottom: 10 }}>
              Комментарии
            </Heading>
            {lead.comments.length === 0 ? (
              <Text muted size={14} style={{ marginBottom: 12 }}>
                Комментариев пока нет. Их видят только руководитель и менеджеры.
              </Text>
            ) : (
              <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
                {lead.comments.map((comment) => (
                  <li
                    key={comment.id}
                    style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--pd-surface-quiet)' }}
                  >
                    <Text muted size={13}>
                      {comment.author.fullName} · {formatDay(comment.createdAt)},{' '}
                      {comment.createdAt.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Europe/Moscow',
                      })}
                    </Text>
                    <Text size={14} style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>
                      {comment.body}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
            <Form action={commentLead}>
              <input type="hidden" name="leadId" value={lead.id} />
              <Field
                label="Новый комментарий"
                name="body"
                required
                multiline
                placeholder="Позвонил, договорились о консультации в четверг"
              />
              <FormActions>
                <Button tone="quiet">Добавить комментарий</Button>
              </FormActions>
            </Form>
          </div>
        </Card>

        <Disclosure title="Исправить сведения заявки" style={{ marginBottom: 24 }}>
          <Form action={saveLead}>
            <input type="hidden" name="leadId" value={lead.id} />
            <FormRow>
              <Field label="Имя" name="name" defaultValue={lead.name ?? ''} />
              <Field
                label={lead.contactKind === 'email' ? 'Почта' : 'Телефон для связи'}
                name="contact"
                required
                defaultValue={lead.contact}
              />
              <Field label="Дополнительный телефон" name="phone" defaultValue={lead.phone ?? ''} />
            </FormRow>
            <FormRow>
              <Field label="Организация или вуз" name="organization" defaultValue={lead.organization ?? ''} />
              <Field label="Желаемый срок" name="deadline" defaultValue={lead.deadline ?? ''} />
            </FormRow>
            <Field label="Тема" name="topic" defaultValue={lead.topic ?? ''} />
            <Field label="Что нужно" name="need" defaultValue={lead.need ?? ''} />
            <Field label="Текст обращения" name="message" multiline defaultValue={lead.message ?? ''} />
            <Text muted size={13} style={{ marginBottom: 12 }}>
              Отметки согласия не правятся: это журнал согласия заявителя. В журнал действий
              попадают названия исправленных полей, а не их значения.
            </Text>
            <FormActions>
              <Button>Сохранить сведения</Button>
            </FormActions>
          </Form>
        </Disclosure>

        {/* Разобранная заявка показывает исход, а не формы. Прежде формы
            стояли всегда: отклонённую можно было «одобрить» вопреки
            письму, где человеку уже ответили «нет», а у развёрнутой в
            работу одобрение падало ошибкой (решение Р-217). */}
        {lead.project !== null ? (
          <Card>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Заявка стала работой
            </Heading>
            <Text>
              <a className="cab-mark" href={`/cabinet/projects/${lead.project.code}`}>
                Работа {lead.project.code}
              </a>
            </Text>
          </Card>
        ) : lead.status === 'DECLINED' ? (
          <Card id="decline">
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Заявка отклонена
            </Heading>
            <Text style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>
              <strong style={{ fontWeight: 600 }}>Причина: </strong>
              {lead.declineReason ?? 'не записана'}
            </Text>
            {flags.resent === undefined ? null : (
              <Outcome>Письмо снова поставлено в очередь на отправку.</Outcome>
            )}
            <Text muted size={13}>
              {declineLetterNote(lead, letter)}
              {letter?.state === 'SENT' ? ` ${formatDay(letter.sentAt) ?? ''}`.trimEnd() + '.' : ''}
            </Text>
            {/* Повтор недоставленного отказа — здесь, а не на экране очереди,
                закрытом менеджеру (требование М-19, решение Р-307). */}
            {letter?.state === 'FAILED' ? (
              <>
                <ActionError id={flags.error} slot="resend" />
                <Form action={resendDeclineLetter}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <FormActions>
                    <Button>Отправить письмо ещё раз</Button>
                  </FormActions>
                </Form>
              </>
            ) : null}
          </Card>
        ) : (
          <>
            <Card style={{ marginBottom: 20 }}>
              <Heading level={2} size={3} style={{ marginBottom: 12 }}>
                Одобрить и создать работу
              </Heading>
              <Form action={moderateLead}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="decision" value="approve" />
                <Field
                  label="Название работы"
                  name="title"
                  required
                  defaultValue={lead.topic ?? ''}
                  placeholder="Сопровождение кандидатской диссертации"
                />
                <Select label="Тип сопровождения" name="serviceTypeId" required>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.hasTemplate ? `${type.name} · есть шаблон этапов` : type.name}
                    </option>
                  ))}
                </Select>
                {managers.length === 0 ? null : (
                  <Select
                    label="Менеджер работы"
                    name="managerId"
                    required
                    defaultValue={managerDefault}
                    hint="Работу ведёт и отвечает клиенту выбранный менеджер; ему придёт письмо."
                  >
                    <option value="">Выберите менеджера</option>
                    {managers.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.fullName}
                        {row.role === 'HEAD' ? ' — руководитель' : ''}
                      </option>
                    ))}
                  </Select>
                )}
                {/* Флажок — только если шаблон есть хотя бы у одного типа: при
                    пустом справочнике шаблонов он молча ничего не делал. Какие
                    типы с шаблоном, видно в самом списке (решение Р-254). */}
                {types.some((type) => type.hasTemplate) ? (
                  <Checkbox
                    name="applyTemplate"
                    label="Применить шаблон этапов, если он есть у выбранного типа"
                  />
                ) : (
                  <Text muted size={13} style={{ marginBottom: 16 }}>
                    Шаблонов этапов в справочнике пока нет — план работ заводится на экране
                    работы, а шаблон добавляет руководитель в разделе «Справочник».
                  </Text>
                )}
                <FormActions>
                  <Button>Одобрить и создать работу</Button>
                </FormActions>
              </Form>
            </Card>

            {/* Отказ — редкий исход, и поле причины на четыре строки занимало
                треть экрана под формой, которой пользуются каждый раз. Под
                свёрткой оно на виду не стоит, а раскрывается на месте
                (решение Р-182). */}
            <Disclosure title="Отклонить заявку">
              <Form action={moderateLead}>
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="decision" value="decline" />
                <Field
                  label="Причина отказа"
                  name="reason"
                  required
                  multiline
                  hint={
                    lead.status === 'SPAM'
                      ? 'Заявка помечена как машинная: письма не будет — адрес в ней мог вписать кто угодно.'
                      : leadAddress(lead) !== null
                        ? 'Причина уйдёт заявителю письмом, поэтому пишется человеческим языком.'
                        : 'Почты для ответа нет: письма не будет, причину сообщите звонком.'
                  }
                />
                <FormActions>
                  <Button tone="quiet">Отклонить заявку</Button>
                </FormActions>
              </Form>
            </Disclosure>
          </>
        )}
      </Narrow>
    </Shell>
  );
}
