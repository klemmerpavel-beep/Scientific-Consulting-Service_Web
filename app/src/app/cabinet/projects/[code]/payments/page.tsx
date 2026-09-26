import { notFound, redirect } from 'next/navigation';

import ActionError from '../../../../../components/cabinet/ActionError';
import Shell from '../../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Block,
  Card,
  Chip,
  Disclosure,
  Field,
  FileField,
  Form,
  FormActions,
  FormRow,
  Heading,
  Mono,
  Notice,
  ScreenHead,
  Select,
  Text,
  formatDate,
  formatSize,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { projectContract, projectMoney, projectPayouts } from '../../../../../lib/cabinet/finance';
import { MATERIAL_KIND_LABEL, type MaterialKind } from '../../../../../lib/cabinet/materials';
import {
  formatAmount,
  nextTrancheStatuses,
  STATUS_LABEL,
  type TrancheStatus,
} from '../../../../../lib/cabinet/money';
import { projectByCode } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import {
  accruePayout,
  addContractTranche,
  changeTrancheStatus,
  dropTranche,
  payPayout,
  saveProjectContract,
  uploadFinanceDocument,
} from '../../../actions';

export const dynamic = 'force-dynamic';

/**
 * Тон чипа транша. Оплаченный выделен акцентом, остальные спокойны:
 * зелёный и красный дизайн-система держит за исходом действия, а статус
 * транша исходом не является (решение Р-146). Статус назван словом.
 */
/** Название перехода на кнопке; оплата идёт своей формой с датой. */
const TRANCHE_ACTION: Record<TrancheStatus, string> = {
  PLANNED: 'Отозвать счёт',
  INVOICED: 'Счёт выставлен',
  PAID: 'Отметить оплату',
  WRITTEN_OFF: 'Списать',
  REVERSED: 'Сторнировать',
};

const TONE: Record<TrancheStatus, 'accent' | 'neutral'> = {
  PAID: 'accent',
  INVOICED: 'neutral',
  PLANNED: 'neutral',
  WRITTEN_OFF: 'neutral',
  REVERSED: 'neutral',
};

export default async function PaymentsScreen({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ exceeds?: string; error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const { code } = await params;
  const flags = await searchParams;
  const exceeds = flags.exceeds === '1';
  const project = await projectByCode(actor, decodeURIComponent(code));
  if (project === null) notFound();

  const ref = {
    id: project.id,
    clientId: project.clientId,
    managerId: project.managerId,
    expertId: project.expertId,
  };
  // Эксперт к договору не допущен: он видит только собственное вознаграждение.
  if (!can(actor, 'CONTRACT_VIEW', ref)) notFound();

  const mayEdit = can(actor, 'PAYMENT_EDIT', ref);
  const maySeeEconomy = can(actor, 'MARGIN_VIEW', ref);

  // Экран не ходит в базу сам: и договор, и начисления читаются службами,
  // которые сами спрашивают разрешение. Прежде условие доступа стояло
  // здесь, а выборка знала о нём только понаслышке (решение Р-185).
  const [money, contract, payouts] = await Promise.all([
    projectMoney(actor, project.id),
    projectContract(actor, project.id),
    maySeeEconomy ? projectPayouts(actor, project.id) : Promise.resolve([]),
  ]);

  const progress =
    money === null || money.contractTotal === 0n
      ? 0
      : Number((money.received * 100n) / money.contractTotal);

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={`/cabinet/projects/${project.code}`}
        backLabel={project.title}
        title="Оплаты и документы"
      />

      <ActionError id={flags.error} />

      {contract === null || money === null ? (
        <Card>
          <Text muted>Договор ещё не заведён.</Text>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip mono>Договор № {contract.number}</Chip>
              {contract.signedOn === null ? null : (
                <Chip>от {formatDate(contract.signedOn)}</Chip>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 20,
                marginTop: 20,
              }}
            >
              <div>
                <Mono>Сумма договора</Mono>
                <Text size={20} style={{ marginTop: 6, color: 'var(--pd-ink)' }}>
                  {formatAmount(money.contractTotal)}
                </Text>
              </div>
              <div>
                <Mono>Получено</Mono>
                <Text size={20} style={{ marginTop: 6, color: 'var(--pd-ink)' }}>
                  {formatAmount(money.received)}
                </Text>
              </div>
              <div>
                <Mono>Осталось оплатить</Mono>
                <Text size={20} style={{ marginTop: 6, color: 'var(--pd-ink)' }}>
                  {formatAmount(money.awaiting)}
                </Text>
              </div>
              {maySeeEconomy && 'margin' in money ? (
                <div>
                  <Mono>Маржа</Mono>
                  <Text size={20} style={{ marginTop: 6, color: 'var(--pd-ink)' }}>
                    {formatAmount(money.margin)}
                  </Text>
                </div>
              ) : null}
            </div>

            <div
              style={{
                height: 6,
                borderRadius: 6,
                background: 'var(--pd-divider)',
                overflow: 'hidden',
                marginTop: 20,
              }}
            >
              <div
                style={{
                  width: `${Math.min(progress, 100)}%`,
                  height: '100%',
                  background: 'var(--pd-accent)',
                }}
              />
            </div>
            <Text muted size={13} style={{ marginTop: 8 }}>
              Оплачено {progress}% суммы договора
              {/* Остаток по договору, не разнесённый траншами, — подсказка
                  тому, кто ведёт оплаты: без транша у суммы нет срока и
                  счёта (решение Р-254). */}
              {mayEdit && money.awaiting > money.scheduled
                ? ` · не разнесено по траншам ${formatAmount(money.awaiting - money.scheduled)}`
                : ''}
            </Text>
          </Card>

          <Block style={{ marginBottom: 20 }}>
            <Heading level={2} size={3}>Транши</Heading>
            <Card style={{ marginTop: 12 }}>
              {contract.tranches.length === 0 ? (
                <Text muted>Транши ещё не заведены.</Text>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
                  {contract.tranches.map((tranche) => (
                    <li
                      key={tranche.id}
                      style={{
                        display: 'flex',
                        gap: 16,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        borderBottom: '1px solid var(--pd-divider)',
                        paddingBottom: 16,
                      }}
                    >
                      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                        <Text size={15} style={{ color: 'var(--pd-ink)' }}>
                          {tranche.title}
                        </Text>
                        <Text muted size={13} style={{ marginTop: 2 }}>
                          {tranche.plannedDate === null
                            ? 'срок не задан'
                            : `срок ${formatDate(tranche.plannedDate)}`}
                          {tranche.paidOn === null
                            ? ''
                            : ` · оплачен ${formatDate(tranche.paidOn)}`}
                        </Text>
                      </div>
                      <Chip tone={TONE[tranche.status as TrancheStatus]}>
                        {STATUS_LABEL[tranche.status as TrancheStatus]}
                      </Chip>
                      <Text size={16} style={{ color: 'var(--pd-ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatAmount(tranche.amount)}
                      </Text>

                      {/* Кнопки строятся из той же таблицы переходов, что
                          проверяет сервер: прежде экран предлагал только
                          «Отметить оплату» — и у списанного транша тоже, — а
                          счёт и списание выставить было нечем (решение Р-224). */}
                      {mayEdit
                        ? nextTrancheStatuses(tranche.status as TrancheStatus).map((next) =>
                            next === 'PAID' ? (
                              <Form key={next} action={changeTrancheStatus} inline>
                                <input type="hidden" name="trancheId" value={tranche.id} />
                                <input type="hidden" name="code" value={project.code} />
                                <input type="hidden" name="status" value="PAID" />
                                <Field
                                  label={`Дата поступления: ${tranche.title}`}
                                  labelHidden
                                  name="paidOn"
                                  type="date"
                                  scope={tranche.id}
                                  required
                                  minWidth={170}
                                />
                                <Button tone="quiet">Отметить оплату</Button>
                              </Form>
                            ) : next === 'REVERSED' ? (
                              // Сторно — с причиной: ошибка отметки или
                              // возврат клиенту (решение Р-249).
                              <Form key={next} action={changeTrancheStatus} inline>
                                <input type="hidden" name="trancheId" value={tranche.id} />
                                <input type="hidden" name="code" value={project.code} />
                                <input type="hidden" name="status" value="REVERSED" />
                                <Field
                                  label={`Причина сторно: ${tranche.title}`}
                                  labelHidden
                                  name="reason"
                                  scope={`reverse-${tranche.id}`}
                                  required
                                  placeholder="Причина: ошибка отметки или возврат"
                                  minWidth={240}
                                />
                                <Button tone="quiet">{TRANCHE_ACTION[next]}</Button>
                              </Form>
                            ) : (
                              <Form key={next} action={changeTrancheStatus} inline>
                                <input type="hidden" name="trancheId" value={tranche.id} />
                                <input type="hidden" name="code" value={project.code} />
                                <input type="hidden" name="status" value={next} />
                                <Button tone="quiet">{TRANCHE_ACTION[next]}</Button>
                              </Form>
                            ),
                          )
                        : null}
                      {/* Плановый транш без документов удаляется: прежде
                          опечатку в сумме лечило только списание (Р-244). */}
                      {mayEdit && tranche.status === 'PLANNED' && tranche.documents.length === 0 ? (
                        <Form action={dropTranche} inline>
                          <input type="hidden" name="trancheId" value={tranche.id} />
                          <input type="hidden" name="code" value={project.code} />
                          <Button tone="quiet">Удалить транш</Button>
                        </Form>
                      ) : null}

                      <div style={{ flexBasis: '100%' }}>
                        {tranche.documents.length === 0 ? null : (
                          <ul
                            style={{
                              margin: '4px 0 0',
                              padding: 0,
                              listStyle: 'none',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 12,
                            }}
                          >
                            {tranche.documents.map((document) => (
                              <li key={document.id} style={{ fontFamily: SANS, fontSize: 14 }}>
                                {document.versions[0] === undefined ? (
                                  document.title
                                ) : (
                                  <a className="cab-mark" href={`/cabinet/files/${document.versions[0].id}`}>
                                    {MATERIAL_KIND_LABEL[document.kind as MaterialKind]}:{' '}
                                    {document.title}
                                  </a>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {mayEdit ? (
                          <Form
                            action={uploadFinanceDocument}
                            encType="multipart/form-data"
                            inline
                            style={{ marginTop: 8 }}
                          >
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="code" value={project.code} />
                            <input type="hidden" name="trancheId" value={tranche.id} />
                            <Select
                              label={`Вид документа: ${tranche.title}`}
                              labelHidden
                              name="kind"
                              scope={tranche.id}
                              defaultValue="INVOICE"
                              minWidth={150}
                            >
                              <option value="INVOICE">счёт</option>
                              <option value="ACT">акт</option>
                            </Select>
                            <FileField
                              label={`Файл документа: ${tranche.title}`}
                              labelHidden
                              name="file"
                              scope={tranche.id}
                              required
                            />
                            <Button tone="quiet">Приложить</Button>
                          </Form>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Превышение суммы договора не запрещается — бывает доплата по
                  дополнительному соглашению, — но и не принимается молча:
                  служба возвращала признак, а экран его терял (решение Р-224). */}
              {mayEdit && exceeds ? (
                <div style={{ marginTop: 16 }}>
                  <Notice tone="quiet">
                    Транш добавлен, но сумма траншей теперь больше суммы договора. Если это доплата
                    по дополнительному соглашению, поправьте сумму договора; если ошибка — уточните
                    транши.
                  </Notice>
                </div>
              ) : null}

              {mayEdit ? (
                <Form
                  action={addContractTranche}
                  style={{
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <FormRow>
                    <Field
                      label="Назначение транша"
                      name="title"
                      scope="tranche"
                      required
                      placeholder="Старт работ"
                    />
                    <Field label="Сумма" name="amount" scope="tranche" required placeholder="240 000" />
                    <Field label="Плановая дата" name="plannedDate" scope="tranche" type="date" />
                  </FormRow>
                  <FormActions>
                    <Button tone="quiet">Добавить транш</Button>
                  </FormActions>
                </Form>
              ) : null}
            </Card>
          </Block>

          <Block style={{ marginBottom: 20 }}>
            <Heading level={2} size={3}>Документы по договору</Heading>
            <Card style={{ marginTop: 12 }}>
              {contract.documents.length === 0 ? (
                <Text muted>
                  Файл договора пока не приложен. Счета и акты прикладываются к траншам — так
                  видно, какой платёж каким документом закрыт.
                </Text>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
                  {contract.documents.map((document) => (
                    <li key={document.id}>
                      <Text size={15}>
                        {document.versions[0] === undefined ? (
                          document.title
                        ) : (
                          <a className="cab-mark" href={`/cabinet/files/${document.versions[0].id}`}>
                            {MATERIAL_KIND_LABEL[document.kind as MaterialKind]}: {document.title}
                          </a>
                        )}
                      </Text>
                      <Text muted size={13}>
                        {document.versions[0] === undefined
                          ? 'файл не загружен'
                          : `${formatSize(document.versions[0].sizeBytes)} · ${formatDate(document.versions[0].uploadedAt)}`}
                      </Text>
                    </li>
                  ))}
                </ul>
              )}

              {mayEdit ? (
                <Form
                  action={uploadFinanceDocument}
                  encType="multipart/form-data"
                  style={{
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="kind" value="CONTRACT" />
                  <FormRow>
                    <Field
                      label="Название"
                      name="title"
                      scope="contract"
                      placeholder="Договор № Д-2026-001"
                    />
                    <FileField label="Файл" name="file" scope="contract" required />
                  </FormRow>
                  <FormActions>
                    <Button tone="quiet">Приложить договор</Button>
                  </FormActions>
                </Form>
              ) : null}
            </Card>
          </Block>

          {maySeeEconomy ? (
            <Block>
              <Heading level={2} size={3}>Вознаграждение эксперта</Heading>
              <Card style={{ marginTop: 12 }}>
                {payouts.length === 0 ? (
                  <Text muted>
                    Начислений нет. У исторических проектов исполнитель не указан, и маржа равна
                    сумме договора.
                  </Text>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
                    {payouts.map((payout) => (
                      <li
                        key={payout.id}
                        style={{
                          display: 'flex',
                          gap: 16,
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          borderBottom: '1px solid var(--pd-divider)',
                          paddingBottom: 14,
                        }}
                      >
                        <div style={{ flex: '1 1 220px' }}>
                          <Text size={15} style={{ color: 'var(--pd-ink)' }}>
                            {payout.expert?.fullName ?? 'исполнитель не указан'}
                          </Text>
                          {payout.comment === null ? null : (
                            <Text muted size={13}>
                              {payout.comment}
                            </Text>
                          )}
                        </div>
                        <Chip>
                          {payout.status === 'PAID'
                            ? `выплачено ${formatDate(payout.paidOn)}`
                            : 'начислено'}
                        </Chip>
                        <Text size={16} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatAmount(payout.amount)}
                        </Text>
                        {payout.status === 'PAID' ? null : (
                          <Form action={payPayout} inline>
                            <input type="hidden" name="payoutId" value={payout.id} />
                            <input type="hidden" name="code" value={project.code} />
                            <Field
                              label={`Дата выплаты: ${payout.expert?.fullName ?? 'начисление'}`}
                              labelHidden
                              name="paidOn"
                              type="date"
                              scope={payout.id}
                              required
                              minWidth={170}
                            />
                            <Button tone="quiet">Отметить выплату</Button>
                          </Form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <Form
                  action={accruePayout}
                  style={{
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <FormRow>
                    <Field
                      label="Сумма начисления"
                      name="amount"
                      scope="payout"
                      required
                      placeholder="80 000"
                    />
                    <Field label="За что" name="comment" scope="payout" placeholder="Глава 2" />
                  </FormRow>
                  <FormActions>
                    <Button tone="quiet">Начислить</Button>
                  </FormActions>
                </Form>
              </Card>
            </Block>
          ) : null}
        </>
      )}

      {/* Договор правится: номер, дата, сумма — не ниже полученного.
          Прежде форма была только для нового договора, а предупреждение
          о превышении советовало «поправить сумму договора» (Р-244). */}
      {mayEdit && contract !== null ? (
        <Disclosure title="Изменить договор" style={{ marginTop: 20 }}>
          <Form action={saveProjectContract}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            <FormRow>
              <Field label="Номер" name="number" required defaultValue={contract.number} />
              <Field
                label="Дата подписания"
                name="signedOn"
                type="date"
                defaultValue={contract.signedOn?.toISOString().slice(0, 10) ?? ''}
              />
              <Field
                label="Сумма договора"
                name="totalAmount"
                required
                defaultValue={formatAmount(contract.totalAmount)}
              />
            </FormRow>
            <FormActions>
              <Button tone="quiet">Сохранить договор</Button>
            </FormActions>
          </Form>
        </Disclosure>
      ) : null}

      {mayEdit && contract === null ? (
        <Card style={{ marginTop: 20 }}>
          <Heading level={3} style={{ marginBottom: 12 }}>
            Завести договор
          </Heading>
          <Form action={saveProjectContract}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            <FormRow>
              <Field label="Номер" name="number" required placeholder="14-2026" />
              <Field label="Дата подписания" name="signedOn" type="date" />
              <Field label="Сумма договора" name="totalAmount" required placeholder="600 000" />
            </FormRow>
            <FormActions>
              <Button>Сохранить</Button>
            </FormActions>
          </Form>
        </Card>
      ) : null}
    </Shell>
  );
}
