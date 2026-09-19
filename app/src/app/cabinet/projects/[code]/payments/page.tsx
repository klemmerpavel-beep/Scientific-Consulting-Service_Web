import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  FileField,
  Form,
  FormActions,
  FormRow,
  Heading,
  Mono,
  ScreenHead,
  Select,
  Text,
  formatDate,
  formatSize,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { projectMoney } from '../../../../../lib/cabinet/finance';
import { MATERIAL_KIND_LABEL, type MaterialKind } from '../../../../../lib/cabinet/materials';
import { formatAmount, STATUS_LABEL, type TrancheStatus } from '../../../../../lib/cabinet/money';
import { projectByCode } from '../../../../../lib/cabinet/queries';
import { currentActor } from '../../../../../lib/cabinet/session';
import { prisma } from '../../../../../lib/db';
import {
  accruePayout,
  addContractTranche,
  changeTrancheStatus,
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
const TONE: Record<TrancheStatus, 'accent' | 'neutral'> = {
  PAID: 'accent',
  INVOICED: 'neutral',
  PLANNED: 'neutral',
  WRITTEN_OFF: 'neutral',
};

export default async function PaymentsScreen({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const { code } = await params;
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

  const [money, contract, payouts] = await Promise.all([
    projectMoney(actor, project.id),
    prisma.contract.findUnique({
      where: { projectId: project.id },
      include: {
        tranches: {
          orderBy: { plannedDate: 'asc' },
          include: {
            documents: {
              where: { deletedAt: null },
              include: { versions: { orderBy: { number: 'desc' }, take: 1 } },
            },
          },
        },
        documents: { where: { deletedAt: null }, include: { versions: { orderBy: { number: 'desc' }, take: 1 } } },
      },
    }),
    maySeeEconomy
      ? prisma.expertPayout.findMany({
          where: { projectId: project.id },
          orderBy: { createdAt: 'desc' },
          include: { expert: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const progress =
    money === null || money.contractTotal === 0n
      ? 0
      : Number((money.received * 100n) / money.contractTotal);

  return (
    <Shell actor={actor} current="/cabinet/projects">
      <ScreenHead
        backHref={`/cabinet/projects/${project.code}`}
        backLabel={project.code}
        title="Оплаты и документы"
        note={project.title}
      />

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
                <Mono>Ожидается</Mono>
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
            </Text>
          </Card>

          <section style={{ marginBottom: 20 }}>
            <Mono>Транши</Mono>
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

                      {mayEdit && tranche.status !== 'PAID' ? (
                        <Form action={changeTrancheStatus} inline>
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
                                  <a href={`/cabinet/files/${document.versions[0].id}`}>
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
          </section>

          <section style={{ marginBottom: 20 }}>
            <Mono>Документы по договору</Mono>
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
                          <a href={`/cabinet/files/${document.versions[0].id}`}>
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
          </section>

          {maySeeEconomy ? (
            <section>
              <Mono>Вознаграждение эксперта</Mono>
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
            </section>
          ) : null}
        </>
      )}

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
