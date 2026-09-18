import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { MONO, SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Mono,
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

const TONE: Record<TrancheStatus, 'ok' | 'accent' | 'neutral' | 'warn'> = {
  PAID: 'ok',
  INVOICED: 'accent',
  PLANNED: 'neutral',
  WRITTEN_OFF: 'warn',
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
      <a className="cab-mark" href={`/cabinet/projects/${project.code}`} style={{ fontFamily: MONO, fontSize: 12 }}>
        {project.code}
      </a>

      <Mono style={{ display: 'block', marginTop: 16 }}>Оплаты и документы</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        {project.title}
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        Оплата идёт траншами по договору. Предоплаченного баланса в кабинете нет: каждая сумма
        привязана к договору и закрывающим документам.
      </Text>

      {contract === null || money === null ? (
        <Card>
          <Text muted>
            Договор ещё не заведён. Как только он появится, здесь будут видны суммы, сроки и
            закрывающие документы.
          </Text>
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
                <Text size={20} style={{ marginTop: 6, color: 'var(--pd-ok-ink)' }}>
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
                  background: 'var(--pd-ok-ink)',
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
                        <form
                          action={changeTrancheStatus}
                          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                        >
                          <input type="hidden" name="trancheId" value={tranche.id} />
                          <input type="hidden" name="code" value={project.code} />
                          <input type="hidden" name="status" value="PAID" />
                          <input
                            type="date"
                            name="paidOn"
                            required
                            aria-label="Дата поступления"
                            style={{
                              minHeight: 44,
                              padding: '0 12px',
                              borderRadius: 10,
                              border: '1px solid var(--pd-edge-neutral)',
                              fontFamily: SANS,
                            }}
                          />
                          <Button tone="quiet">Отметить оплату</Button>
                        </form>
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
                          <form
                            action={uploadFinanceDocument}
                            style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}
                          >
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="code" value={project.code} />
                            <input type="hidden" name="trancheId" value={tranche.id} />
                            <select
                              name="kind"
                              aria-label="Вид документа"
                              defaultValue="INVOICE"
                              style={{
                                minHeight: 44,
                                padding: '0 12px',
                                borderRadius: 10,
                                border: '1px solid var(--pd-edge-neutral)',
                                fontFamily: SANS,
                                fontSize: 16,
                              }}
                            >
                              <option value="INVOICE">счёт</option>
                              <option value="ACT">акт</option>
                            </select>
                            <input
                              type="file"
                              name="file"
                              required
                              aria-label="Файл документа"
                              style={{ fontFamily: SANS, fontSize: 15 }}
                            />
                            <Button tone="quiet">Приложить</Button>
                          </form>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {mayEdit ? (
                <form
                  action={addContractTranche}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <Field label="Назначение транша" name="title" required placeholder="Старт работ" />
                  <Field label="Сумма" name="amount" required placeholder="240 000" />
                  <Field label="Плановая дата" name="plannedDate" type="date" />
                  <div>
                    <Button tone="quiet">Добавить транш</Button>
                  </div>
                </form>
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
                <form
                  action={uploadFinanceDocument}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <input type="hidden" name="contractId" value={contract.id} />
                  <input type="hidden" name="kind" value="CONTRACT" />
                  <Field label="Название" name="title" placeholder="Договор № Д-2026-001" />
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>Файл</span>
                    <input type="file" name="file" required style={{ fontFamily: SANS, fontSize: 15 }} />
                  </label>
                  <div>
                    <Button tone="quiet">Приложить договор</Button>
                  </div>
                </form>
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
                        <Chip tone={payout.status === 'PAID' ? 'ok' : 'neutral'}>
                          {payout.status === 'PAID'
                            ? `выплачено ${formatDate(payout.paidOn)}`
                            : 'начислено'}
                        </Chip>
                        <Text size={16} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatAmount(payout.amount)}
                        </Text>
                        {payout.status === 'PAID' ? null : (
                          <form action={payPayout} style={{ display: 'flex', gap: 8 }}>
                            <input type="hidden" name="payoutId" value={payout.id} />
                            <input type="hidden" name="code" value={project.code} />
                            <input
                              type="date"
                              name="paidOn"
                              required
                              aria-label="Дата выплаты"
                              style={{
                                minHeight: 44,
                                padding: '0 12px',
                                borderRadius: 10,
                                border: '1px solid var(--pd-edge-neutral)',
                                fontFamily: SANS,
                              }}
                            />
                            <Button tone="quiet">Отметить выплату</Button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <form
                  action={accruePayout}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                    marginTop: 20,
                    paddingTop: 20,
                    borderTop: '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="code" value={project.code} />
                  <Field label="Сумма начисления" name="amount" required placeholder="80 000" />
                  <Field label="За что" name="comment" placeholder="Глава 2" />
                  <div>
                    <Button tone="quiet">Начислить</Button>
                  </div>
                </form>
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
          <form
            action={saveProjectContract}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
              alignItems: 'end',
            }}
          >
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="code" value={project.code} />
            <Field label="Номер" name="number" required placeholder="14-2026" />
            <Field label="Дата подписания" name="signedOn" type="date" />
            <Field label="Сумма договора" name="totalAmount" required placeholder="600 000" />
            <div>
              <Button>Сохранить</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </Shell>
  );
}
