import { notFound, redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import {
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Notice,
  Outcome,
  ScreenHead,
  Select,
  Text,
} from '../../../../../components/cabinet/ui';
import { can, workClosed } from '../../../../../lib/cabinet/access';
import { projectContract } from '../../../../../lib/cabinet/finance';
import { formDraft } from '../../../../../lib/cabinet/flash';
import { formatAmount } from '../../../../../lib/cabinet/money';
import {
  PROJECT_STATUS_ACTION,
  PROJECT_STATUS_LABEL,
  nextProjectStatuses,
  type ProjectStatusKey,
} from '../../../../../lib/cabinet/project-status';
import { projectByCode, serviceTypes } from '../../../../../lib/cabinet/queries';
import { requireActor } from '../../../../../lib/cabinet/session';
import { candidateLine } from '../../../../../lib/cabinet/client-match';
import { clientCandidates, transferBlockers } from '../../../../../lib/cabinet/orders';
import { moveOrderToClientAction, saveOrder } from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * «Редактировать заказ» (запрос владельца 13.11.2026, решение Р-872).
 *
 * Одно место, где руководитель и менеджер своей работы правят заказ:
 * карточку (название, тема, описание, вид работы, срок), сумму договора,
 * состояние и клиента. Работает и у закрытой работы, и у перенесённой из
 * книги заказов: закрытость запрещает этапы, а не учёт. Деньги, которые
 * пришли, записываются на «Оплатах и документах» — ссылка в шапке.
 */
export default async function OrderEditScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; saved?: string; q?: string; moved?: string }>;
}) {
  const actor = await requireActor(`/cabinet/projects/${(await params).code}/order`);
  const { code } = await params;
  const project = await projectByCode(actor, decodeURIComponent(code));
  if (project === null) notFound();
  const ref = { id: project.id, clientId: project.clientId, managerId: project.managerId, expertId: project.expertId };
  if (!can(actor, 'PROJECT_EDIT', ref)) redirect(`/cabinet/projects/${project.code}`);

  const sp = await searchParams;
  const draft = (await formDraft(sp.error)) ?? {};
  const saved = sp.saved === '1' && sp.error === undefined;
  const mayMoney = can(actor, 'PAYMENT_EDIT', ref);
  const [contract, types] = await Promise.all([
    mayMoney ? projectContract(actor, project.id) : Promise.resolve(null),
    serviceTypes(actor),
  ]);
  // Снятый с действия вид остаётся в выборе у работы, которая его носит.
  const typeChoices = types.some((type) => type.id === project.serviceTypeId)
    ? types
    : [{ id: project.serviceTypeId, name: project.serviceType.name }, ...types];
  const received =
    contract === null
      ? 0n
      : contract.tranches.filter((tranche) => tranche.status === 'PAID').reduce((acc, tranche) => acc + tranche.amount, 0n);
  const closed = workClosed(project.status);
  const fromBook = project.source === 'IMPORT';
  // Срок действующей работы из кабинета переносится с причиной для
  // клиента (УМ-12, Р-391); у закрытой и у работы из книги — без неё.
  const quiet = closed || fromBook;
  const status = project.status as ProjectStatusKey;
  const base = `/cabinet/projects/${encodeURIComponent(project.code)}`;
  // Перенос к другому клиенту (Р-873): что держит работу у прежнего, и
  // карточки по запросу — только когда переносить можно.
  const query = (sp.q ?? '').trim().slice(0, 100);
  const blockers = await transferBlockers(actor, project.id);
  const candidates = blockers.length === 0 && query.length >= 2 ? await clientCandidates(actor, project.id, query) : [];
  const moved = sp.moved === '1' && sp.error === undefined;

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={base}
        backLabel={project.title}
        title="Редактировать заказ"
        note={
          fromBook
            ? 'Работа перенесена из книги заказов. Правка карточки, суммы и состояния писем клиенту и куратору не шлёт.'
            : 'Правка полей карточки и суммы писем клиенту не шлёт. Письмо уходит только о переносе срока действующей работы и о смене состояния.'
        }
        action={mayMoney ? <ButtonLink href={`${base}/payments#money`}>Деньги по заказу</ButtonLink> : undefined}
      />
      <ActionError id={sp.error} />

      <Card id="card" style={{ marginBottom: 20, scrollMarginTop: 24 }}>
        {saved ? <Outcome>Заказ сохранён.</Outcome> : null}
        <Form action={saveOrder}>
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="code" value={project.code} />
          {/* Отметка прочитанной карточки: чужая правка не затирается (Р-360). */}
          <input type="hidden" name="updatedAt" value={project.updatedAt.toISOString()} />
          <Heading level={2} size={3}>
            Карточка заказа
          </Heading>
          <ActionError id={sp.error} slot="order" />
          <FormRow>
            <Field label="Название" name="title" scope="order" required maxLength={300} defaultValue={draft.title ?? project.title} />
            <Select label="Вид работы" name="serviceTypeId" scope="order" required defaultValue={draft.serviceTypeId ?? project.serviceTypeId}>
              {typeChoices.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </FormRow>
          <Field label="Тема" name="topic" scope="order" maxLength={500} defaultValue={draft.topic ?? project.topic ?? ''} />
          <Field
            label="Описание"
            name="summary"
            scope="order"
            multiline
            maxLength={2000}
            defaultValue={draft.summary ?? project.summary ?? ''}
            hint="Видно клиенту под раскрытием «О работе»."
          />
          <div id="due" style={{ scrollMarginTop: 24 }}>
          <FormRow>
            <Field
              label="Срок работы"
              name="dueOn"
              scope="order"
              type="date"
              defaultValue={draft.dueOn ?? project.dueOn?.toISOString().slice(0, 10) ?? ''}
            />
            {quiet ? null : (
              <Field
                label="Причина переноса срока"
                name="dueReason"
                scope="order"
                defaultValue={draft.dueReason ?? ''}
                hint="Нужна, только если срок уже был и меняется: клиент и куратор получат её письмом."
              />
            )}
            <Field
              label="Срок согласования этапа, рабочих дней"
              name="approvalDays"
              scope="order"
              type="number"
              required
              defaultValue={draft.approvalDays ?? String(project.approvalDays)}
              hint="От 5 до 20; действует со следующей сдачи этапа."
            />
          </FormRow>
          </div>
          {mayMoney ? (
            <div id="money" style={{ scrollMarginTop: 24 }}>
              <Field
                label="Сумма договора, ₽"
                name="contractTotal"
                scope="order"
                placeholder="120 000"
                defaultValue={draft.contractTotal ?? (contract === null ? '' : formatAmount(contract.totalAmount))}
                hint={
                  contract === null
                    ? `Договора ещё нет: он заведётся с номером ${project.code}. Пусто — без договора.`
                    : `Договор № ${contract.number}. Не меньше уже поступившего — ${formatAmount(received)}. Номер, дату и документы правят на «Оплатах и документах».`
                }
              />
            </div>
          ) : null}
          <FormActions>
            <Button>Сохранить заказ</Button>
            <ButtonLink href={base}>К карточке работы</ButtonLink>
          </FormActions>
        </Form>
      </Card>

      {/* Состояние — тем же переходом с причиной и подтверждением, что в
          «Управлении работой» (М-09, Р-299). */}
      <Card id="status" style={{ marginBottom: 20, scrollMarginTop: 24 }}>
        <Heading level={2} size={3} style={{ marginBottom: 8 }}>
          Состояние работы
        </Heading>
        <Text size={15}>{`Сейчас: ${PROJECT_STATUS_LABEL[status].toLowerCase()}.`}</Text>
        <Text muted size={13} style={{ marginTop: 4 }}>
          {fromBook
            ? 'На следующем шаге — последствия и подтверждение. Работа из книги: письма клиенту и куратору не уходят.'
            : 'На следующем шаге — последствия, причина для клиента и подтверждение.'}
        </Text>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {nextProjectStatuses(status).map((next) => (
            <ButtonLink key={next} href={`${base}/status?to=${next}`}>
              {PROJECT_STATUS_ACTION[next]}
            </ButtonLink>
          ))}
        </div>
      </Card>

      {/* Клиент заказа: перенос к другой существующей карточке — с явным
          подтверждением; прежний клиент сразу теряет доступ (Р-873). */}
      <Card id="client" style={{ scrollMarginTop: 24 }}>
        <Heading level={2} size={3} style={{ marginBottom: 8 }}>
          Клиент
        </Heading>
        {moved ? <Outcome>{`Работа перенесена к клиенту ${project.client.fullName}. Прежний клиент её больше не видит.`}</Outcome> : null}
        <Text size={15}>{project.client.fullName}</Text>
        {[project.client.email, project.client.phone].some((value) => (value ?? '').trim() !== '') ? (
          <Text muted size={13}>
            {[project.client.email, project.client.phone].filter((value) => (value ?? '').trim() !== '').join(' · ')}
          </Text>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <ActionError id={sp.error} slot="client" />
        </div>
        {blockers.length > 0 ? (
          <Notice tone="quiet" role="status">
            {`К другому клиенту эта работа не переносится: перенос открыл бы новому клиенту то, что относится к прежнему — ${blockers.join('; ')}. Если это один человек с двумя карточками, руководитель сводит карточки в «Переносе книги заказов»; если работа заведена не на того клиента, заведите заказ заново на нужного.`}
          </Notice>
        ) : (
          <>
            <Form action={`${base}/order#client`} method="get" inline>
              <Field
                label="Перенести работу к другому клиенту: найти карточку"
                name="q"
                scope="client"
                defaultValue={query}
                placeholder="Фамилия, почта или телефон"
                minWidth={260}
              />
              <Button tone="quiet">Найти</Button>
            </Form>
            {query.length >= 2 && candidates.length === 0 ? (
              <Text muted size={14} style={{ marginTop: 12 }}>
                {actor.role === 'MANAGER'
                  ? 'Карточек не найдено. Клиентов других менеджеров здесь нет: такой перенос делает руководитель.'
                  : 'Карточек не найдено. Новая карточка заводится «Новым заказом».'}
              </Text>
            ) : null}
            {candidates.length === 0 ? null : (
              <Form action={moveOrderToClientAction} style={{ marginTop: 16 }}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="code" value={project.code} />
                <input type="hidden" name="q" value={query} />
                <Select
                  label="Новый клиент работы"
                  name="clientId"
                  scope="client"
                  required
                  defaultValue=""
                  hint="Почта и телефон скрыты частично, видно число работ карточки."
                >
                  <option value="" disabled>
                    — выберите карточку —
                  </option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidateLine(candidate)}
                    </option>
                  ))}
                </Select>
                <Checkbox
                  name="confirm"
                  required
                  label="Понимаю: прежний клиент сразу потеряет доступ к работе; договор, оплаты и история остаются при работе"
                />
                <FormActions>
                  <Button>Перенести работу</Button>
                </FormActions>
              </Form>
            )}
          </>
        )}
      </Card>
    </Shell>
  );
}
