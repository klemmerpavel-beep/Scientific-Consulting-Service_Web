import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Disclosure,
  Field,
  FileField,
  Form,
  FormActions,
  FormRow,
  Notice,
  ScreenHead,
  Select,
} from '../../../../../components/cabinet/ui';
import { loadBrief } from '../../../../../lib/cabinet/brief/intake';
import { orderDraftFromBrief } from '../../../../../lib/cabinet/brief/order-draft';
import { can } from '../../../../../lib/cabinet/access';
import { moscowToday } from '../../../../../lib/cabinet/clock';
import { curators, serviceTypes } from '../../../../../lib/cabinet/queries';
import { NEW_CLIENT, candidateLine } from '../../../../../lib/cabinet/client-match';
import { formDraft } from '../../../../../lib/cabinet/flash';
import { nameCandidates } from '../../../../../lib/cabinet/manual-order';
import { requireActor } from '../../../../../lib/cabinet/session';
import { homeFor } from '../../../../../lib/cabinet/nav';
import { createOrder, parseOrderBrief } from '../../../actions';

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
  searchParams: Promise<{ error?: string; brief?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/orders/new');
  if (!can(actor, 'REQUEST_MODERATE')) redirect(homeFor(actor));

  const head = actor.role === 'HEAD';
  const [types, staff] = await Promise.all([serviceTypes(actor), head ? curators(actor) : Promise.resolve([])]);
  const today = moscowToday().toISOString().slice(0, 10);
  // Набранное возвращается после отказа; совпадение только по ФИО
  // открывает выбор карточки заказчика (требование М-18, решение Р-308).
  const { error: errorId, brief: briefRef } = await searchParams;
  // Документ заполняет ту же форму (решение Р-556); набранное после отказа
  // важнее разобранного.
  const loaded = briefRef === undefined ? null : await loadBrief(actor, 'REQUEST_MODERATE', briefRef);
  const fromBrief = loaded === null ? null : orderDraftFromBrief(loaded.brief, types);
  const draft: Record<string, string | undefined> = { ...(fromBrief?.values ?? {}), ...((await formDraft(errorId)) ?? {}) };
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
      {/* Анкета или исходные данные заполняют форму сами (решение Р-556). */}
      <Disclosure title="Заполнить из документа" open={briefRef !== undefined && loaded === null} style={{ marginBottom: 16 }}>
        <Form action={parseOrderBrief}>
          <FileField
            label="Анкета заказа или исходные данные"
            name="brief"
            accept=".docx,.xlsx"
            required
            hint="Word или Excel до 2 МБ. Шаблоны — в «Управлении» и на вкладке «Шаблоны» чек-листов."
          />
          <FormActions>
            <Button tone="quiet">Разобрать</Button>
          </FormActions>
        </Form>
      </Disclosure>
      {briefRef !== undefined && loaded === null ? (
        <Notice tone="quiet" role="status">
          Документ не найден: загрузите его снова.
        </Notice>
      ) : null}
      <Card>
        {fromBrief === null ? null : (
          <Notice tone="quiet" role="status">
            Поля заполнены из документа: проверьте их и нажмите «Завести заказ». Стоимость документ не несёт.
            {[...loaded!.brief.issues, ...fromBrief.notes].length === 0 ? null : (
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {[...loaded!.brief.issues, ...fromBrief.notes].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
        <Form action={createOrder}>
          {/* Документ уходит в материалы созданной работы (Р-556). */}
          {loaded === null ? null : <input type="hidden" name="brief" value={briefRef} />}
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
          {/* Суть задачи, вуз и направление — из документа или вручную
              (решение Р-556): суть ложится в карточку работы, вуз и
              направление дополняют пустые поля карточки клиента. */}
          <Field
            label="Суть задачи"
            name="summary"
            multiline
            placeholder="Цель, задачи, научный руководитель — необязательно"
            defaultValue={draft.summary}
          />
          <FormRow>
            <Field label="Вуз или организация" name="university" placeholder="необязательно" defaultValue={draft.university} />
            <Field label="Направление или специальность" name="speciality" placeholder="необязательно" defaultValue={draft.speciality} />
          </FormRow>
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
              <Select label="Менеджер работы" name="managerId" defaultValue={draft.managerId || actor.id}>
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
