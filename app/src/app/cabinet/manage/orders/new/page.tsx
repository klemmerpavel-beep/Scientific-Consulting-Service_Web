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
import { currentActor } from '../../../../../lib/cabinet/session';
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
  if (!can(actor, 'REQUEST_MODERATE')) redirect('/cabinet/projects');

  const head = actor.role === 'HEAD';
  const [types, staff] = await Promise.all([serviceTypes(actor), head ? curators(actor) : Promise.resolve([])]);
  const today = moscowToday().toISOString().slice(0, 10);

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref="/cabinet/projects"
        backLabel="к работам"
        title="Новый заказ"
        note="Для заказа, пришедшего звонком, письмом или от постоянного клиента. Поля — как в книге заказов. Заказчик с тем же ФИО попадает в свою прежнюю карточку. Учётная запись клиенту не заводится и писем не уходит: вход открывается отдельно, на экране «Учётные записи»."
      />
      <ActionError id={(await searchParams).error} />
      <Card>
        <Form action={createOrder}>
          <FormRow>
            <Field label="Заказчик (ФИО)" name="customer" required placeholder="Иванов Иван Иванович" />
            <Field label="Почта" name="email" type="email" placeholder="необязательно" />
            <Field label="Телефон" name="phone" type="tel" placeholder="необязательно" />
          </FormRow>
          <FormRow>
            <Select label="Вид работы" name="serviceTypeId" required>
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
            />
          </FormRow>
          <Field
            label="Описание работы"
            name="topic"
            multiline
            placeholder="Тема работы, цель, особые условия"
          />
          <FormRow>
            <Field label="Дата заказа" name="orderedOn" type="date" defaultValue={today} />
            <Field label="Дедлайн" name="dueOn" type="date" />
            <Field
              label="Стоимость, ₽"
              name="cost"
              placeholder="125 000"
              hint="Пусто — договор заводится позже, на экране «Оплаты и документы»."
            />
            <Field label="Оплачено, ₽" name="paid" placeholder="0" />
          </FormRow>
          <FormRow>
            <Select label="Состояние" name="status" defaultValue="ACTIVE">
              <option value="ACTIVE">в работе</option>
              <option value="PAUSED">остановлена</option>
              <option value="COMPLETED">завершена</option>
            </Select>
            {head ? (
              <Select label="Куратор" name="managerId" defaultValue={actor.id}>
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
