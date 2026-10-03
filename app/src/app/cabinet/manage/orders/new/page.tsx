import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Field,
  Form,
  FormActions,
  FormRow,
  ScreenHead,
  Select,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { moscowToday } from '../../../../../lib/cabinet/clock';
import { curators, serviceTypes } from '../../../../../lib/cabinet/queries';
import { NEW_CLIENT, candidateLine } from '../../../../../lib/cabinet/client-match';
import { formDraft } from '../../../../../lib/cabinet/flash';
import { nameCandidates } from '../../../../../lib/cabinet/manual-order';
import { currentActor } from '../../../../../lib/cabinet/session';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { createOrder } from '../../../actions';

export const metadata: Metadata = { title: 'Новый заказ — ProDisser' };
export const dynamic = 'force-dynamic';

/**
 * Новый заказ вручную: звонок, письмо, повторный заказ постоянного клиента
 * (решение Р-269). Поля — те же, что у строки книги заказов, чтобы заказ,
 * заведённый здесь, и заказ из книги читались одинаково.
 */
export default async function NewOrderScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'REQUEST_MODERATE')) redirect(homeFor(actor));

  const head = actor.role === 'HEAD';
  const [types, staff] = await Promise.all([serviceTypes(actor), head ? curators(actor) : Promise.resolve([])]);
  const today = moscowToday().toISOString().slice(0, 10);
  // Набранное возвращается после отказа; совпадение только по ФИО
  // открывает выбор карточки заказчика (требование М-18, решение Р-308).
  const errorId = (await searchParams).error;
  const draft = (await formDraft(errorId)) ?? {};
  const candidates =
    draft.clientChoiceNeeded === '1' ? await nameCandidates(actor, draft.customer ?? '') : [];

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref="/cabinet/projects"
        backLabel="к работам"
        title="Новый заказ"
        note={`Для заказа, пришедшего звонком, письмом или от постоянного клиента. Поля — как в книге заказов. Заказчик ищется по почте и телефону; если совпало только ФИО, выберите его карточку или заведите новую. Писем клиенту не уходит. Вход в кабинет открывается кнопкой «Открыть клиенту вход» в «Управлении работой» созданной работы: нужен адрес почты клиента.${
          head ? '' : ' Договор со стоимостью увидит руководитель: ему уходит уведомление, а менять суммы после сохранения может только он.'
        }`}
      />
      <ActionError id={errorId} />
      <Card>
        <Form action={createOrder}>
          <FormRow>
            <Field
              label="Заказчик (ФИО)"
              name="customer"
              required
              placeholder="Иванов Иван Иванович"
              defaultValue={draft.customer}
            />
            <Field label="Почта" name="email" type="email" placeholder="необязательно" defaultValue={draft.email} />
            <Field label="Телефон" name="phone" type="tel" placeholder="необязательно" defaultValue={draft.phone} />
          </FormRow>
          {candidates.length === 0 ? null : (
            <Select
              label="Карточка заказчика"
              name="clientChoice"
              required
              defaultValue=""
              hint="Найдены по ФИО: почта и телефон скрыты, видно число работ. Выберите карточку этого человека или заведите новую, если это однофамилец."
            >
              <option value="" disabled>
                — выберите —
              </option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidateLine(candidate)}
                </option>
              ))}
              <option value={NEW_CLIENT}>Новая карточка — другой человек с тем же ФИО</option>
            </Select>
          )}
          <FormRow>
            <Select label="Вид работы" name="serviceTypeId" required defaultValue={draft.serviceTypeId}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
            <Field
              label="Название работы"
              name="title"
              required
              placeholder="Диссертация"
              hint="Как в столбце «Тип работы» книги: «Диплом магистра», «Научная статья Q2»."
              defaultValue={draft.title}
            />
          </FormRow>
          <Field
            label="Описание работы"
            name="topic"
            multiline
            placeholder="Тема работы, цель, особые условия"
            defaultValue={draft.topic}
          />
          <FormRow>
            <Field label="Дата заказа" name="orderedOn" type="date" defaultValue={draft.orderedOn || today} />
            <Field label="Дедлайн" name="dueOn" type="date" defaultValue={draft.dueOn} />
            <Field
              label="Стоимость, ₽"
              name="cost"
              placeholder="125 000"
              hint="Пусто — договор заводится позже, на экране «Оплаты и документы»."
              defaultValue={draft.cost}
            />
            <Field label="Оплачено, ₽" name="paid" placeholder="0" defaultValue={draft.paid} />
          </FormRow>
          <FormRow>
            <Select label="Состояние" name="status" defaultValue={draft.status || 'ACTIVE'}>
              <option value="ACTIVE">в работе</option>
              <option value="PAUSED">остановлена</option>
              <option value="COMPLETED">завершена</option>
            </Select>
            {head ? (
              <Select label="Куратор" name="managerId" defaultValue={draft.managerId || actor.id}>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                    {person.role === 'HEAD' ? ' — руководитель' : ''}
                  </option>
                ))}
              </Select>
            ) : null}
          </FormRow>
          <FormActions>
            <Button>Завести заказ</Button>
          </FormActions>
        </Form>
      </Card>
    </Shell>
  );
}
