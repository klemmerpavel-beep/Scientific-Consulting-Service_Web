import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Empty,
  Form,
  FormActions,
  Heading,
  Mono,
  Notice,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  TableCard,
  Text,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { erasableClients, listErasureRequests } from '../../../../lib/cabinet/erasure';
import { formatMoment } from '../../../../lib/cabinet/journals';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';
import { executeErasureRequest, openErasureRequest } from '../../actions';

export const dynamic = 'force-dynamic';

interface Report {
  projects?: number;
  messages?: number;
  versions?: number;
  objectsPurged?: number;
  objectsFailed?: number;
  sessionsRevoked?: number;
  contracts?: number;
  contractTotal?: string;
}

export default async function ErasureScreen({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Обезличивание необратимо, поэтому доступно только руководителю.
  if (!can(actor, 'ERASURE_EXECUTE')) redirect('/cabinet/projects');

  const flags = await searchParams;
  const [clients, requests] = await Promise.all([
    erasableClients(actor),
    listErasureRequests(actor),
  ]);

  return (
    <Shell actor={actor} current="/cabinet/manage/erasure">
      <Mono>Персональные данные</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        Удаление по требованию субъекта
      </Heading>
      <Text muted style={{ marginBottom: 20 }}>
        Статьи 14 и 21 Федерального закона № 152-ФЗ. Затираются ФИО, контакты, вуз, специальность,
        тема работы, имена файлов и тела сообщений; объекты изымаются из хранилища. Сохраняются код
        проекта, суммы договора и траншей, строки версий и записи журналов — первичные учётные
        документы хранятся своими сроками, и по ним человека опознать нельзя.
      </Text>

      {flags.done === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice>Требование исполнено. Отчёт записан и показан в перечне ниже.</Notice>
        </div>
      )}

      <Card style={{ marginBottom: 32 }}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Принять требование
        </Heading>
        <Form action={openErasureRequest} style={{ maxWidth: 560 }}>
          <Select label="Карточка клиента" name="clientId" required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.fullName} — {client._count.projects}{' '}
                {plural(client._count.projects, 'проект', 'проекта', 'проектов')}
              </option>
            ))}
          </Select>
          <Select label="Объём" name="scope" defaultValue="PERSONAL_DATA_AND_FILES">
            <option value="PERSONAL_DATA_AND_FILES">Данные и файлы</option>
            <option value="PERSONAL_DATA">Только данные, файлы сохранить</option>
          </Select>
          <FormActions>
            <Button tone="quiet">Зарегистрировать требование</Button>
          </FormActions>
        </Form>
      </Card>

      <Heading level={2} style={{ marginBottom: 12 }}>
        Требования
      </Heading>
      {requests.length === 0 ? (
        <Empty title="Требований не поступало">
          Здесь появятся требования субъектов и отчёты об их исполнении.
        </Empty>
      ) : (
        <TableCard label="Требования субъектов">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Принято</th>
                <th style={TABLE_HEAD} scope="col">Карточка</th>
                <th style={TABLE_HEAD} scope="col">Объём</th>
                <th style={TABLE_HEAD} scope="col">Состояние</th>
                <th style={TABLE_HEAD} scope="col">Отчёт</th>
                <th style={TABLE_HEAD} scope="col">Действие</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const report = (request.report ?? {}) as Report;
                return (
                  <tr key={request.id}>
                    <td style={TABLE_CELL}>{formatMoment(request.requestedAt)}</td>
                    <td style={TABLE_CELL}>{request.client.fullName}</td>
                    <td style={TABLE_CELL}>
                      {request.scope === 'PERSONAL_DATA_AND_FILES' ? 'данные и файлы' : 'только данные'}
                    </td>
                    <td style={TABLE_CELL}>
                      {request.executedAt === null ? (
                        <Chip>ожидает исполнения</Chip>
                      ) : (
                        <>
                          <Chip>исполнено</Chip>
                          <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)', marginTop: 4 }}>
                            {formatMoment(request.executedAt)}
                            {request.approvedBy === null ? null : ` · ${request.approvedBy.fullName}`}
                          </div>
                        </>
                      )}
                    </td>
                    <td style={TABLE_CELL}>
                      {request.executedAt === null ? (
                        '—'
                      ) : (
                        <>
                          Проектов {report.projects ?? 0}, сообщений {report.messages ?? 0}, версий{' '}
                          {report.versions ?? 0}, объектов изъято {report.objectsPurged ?? 0}
                          {report.objectsFailed ? `, не найдено ${report.objectsFailed}` : ''}.
                          <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)', marginTop: 4 }}>
                            Сессий отозвано {report.sessionsRevoked ?? 0}. Суммы договоров сохранены:{' '}
                            {report.contractTotal === undefined
                              ? '—'
                              : formatAmount(BigInt(report.contractTotal))}{' '}
                            по {report.contracts ?? 0}{' '}
                            {plural(report.contracts ?? 0, 'договору', 'договорам', 'договорам')}.
                          </div>
                        </>
                      )}
                    </td>
                    <td style={TABLE_CELL}>
                      {request.executedAt !== null ? (
                        '—'
                      ) : (
                        <Form action={executeErasureRequest} inline>
                          <input type="hidden" name="requestId" value={request.id} />
                          <Button>Исполнить</Button>
                        </Form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      <Text muted size={13} style={{ marginTop: 12 }}>
        Исполнение необратимо: затёртые значения не восстанавливаются, изъятые объекты не
        возвращаются. Отчёт об исполнении выгружается субъекту по его требованию.
      </Text>
    </Shell>
  );
}
