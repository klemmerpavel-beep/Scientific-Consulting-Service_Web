import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Mono,
  Notice,
  Text,
  formatDate,
  plural,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
} from '../../../../../components/cabinet/ui';
import { can } from '../../../../../lib/cabinet/access';
import { prisma } from '../../../../../lib/db';
import { loadBatch } from '../../../../../lib/cabinet/import/apply';
import { formatAmount } from '../../../../../lib/cabinet/money';
import { currentActor } from '../../../../../lib/cabinet/session';
import { applyOrderBook, mergeClientCards } from '../../../actions';

export const dynamic = 'force-dynamic';

const ACTION_LABEL = {
  CREATE: 'завести',
  UPDATE: 'обновить',
  SKIP: 'уже перенесена',
} as const;

export default async function ImportBatchScreen({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ applied?: string; merged?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'IMPORT_RUN')) redirect('/cabinet/projects');

  const { batchId } = await params;
  const flags = await searchParams;
  const report = await loadBatch(actor, batchId);
  if (report === null) notFound();

  const applied = report.state === 'APPLIED';
  const managers = await prisma.user.findMany({
    where: { role: { in: ['MANAGER', 'HEAD'] }, status: 'ACTIVE' },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  const issues = Object.entries(report.issueCounts).filter(([, count]) => count > 0);
  const rowsByIssue = (code: string) =>
    report.rows
      .filter((row) => row.issues.some((issue) => issue.code === code))
      .map((row) => row.rowNumber);

  const tiles = [
    { label: 'Строк в книге', value: String(report.rows.length) },
    { label: 'Законтрактовано', value: formatAmount(report.totals.cost) },
    { label: 'Получено', value: formatAmount(report.totals.paid) },
    { label: 'Остаток', value: formatAmount(report.totals.cost - report.totals.paid) },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/import">
      <Mono>Отчёт загрузки</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        {report.fileName}
      </Heading>
      <Text muted style={{ marginBottom: 20 }}>
        Лист «{report.sheet}», загружена {formatDate(report.createdAt)}. К заведению{' '}
        {report.counts.CREATE}, к обновлению {report.counts.UPDATE}, уже перенесено{' '}
        {report.counts.SKIP}.
      </Text>

      {flags.applied === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice>Загрузка зафиксирована. Проекты заведены и доступны в реестре.</Notice>
        </div>
      )}
      {flags.merged === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice>Карточки сведены: проекты переведены на основную.</Notice>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <Mono>{tile.label}</Mono>
            <Text
              size={22}
              style={{ marginTop: 8, color: 'var(--pd-ink)', fontVariantNumeric: 'tabular-nums' }}
            >
              {tile.value}
            </Text>
          </Card>
        ))}
      </div>

      <Heading level={2} style={{ marginBottom: 12 }}>
        Замечания разбора
      </Heading>
      {issues.length === 0 ? (
        <Card style={{ marginBottom: 28 }}>
          <Text muted>Замечаний нет: книга разобрана без расхождений.</Text>
        </Card>
      ) : (
        <Card style={{ marginBottom: 28, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">
                  Замечание
                </th>
                <th style={TABLE_HEAD} scope="col">
                  Строк
                </th>
                <th style={TABLE_HEAD} scope="col">
                  Номера строк книги
                </th>
              </tr>
            </thead>
            <tbody>
              {issues.map(([code, count]) => {
                const label =
                  report.rows
                    .flatMap((row) => row.issues)
                    .find((issue) => issue.code === code)?.label ?? code;
                return (
                  <tr key={code}>
                    <td style={TABLE_CELL}>{label}</td>
                    <td style={TABLE_NUM}>{count}</td>
                    <td style={TABLE_CELL}>{rowsByIssue(code).join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Heading level={2} style={{ marginBottom: 8 }}>
        Цвет против текста
      </Heading>
      <Text muted style={{ marginBottom: 12 }}>
        Состояние работы берётся по тексту статуса. Заливка сохранена и показана рядом: выбор
        между «работа доведена» и «работа идёт» остаётся за руководителем.
      </Text>
      <Card style={{ marginBottom: 28 }}>
        {report.conflicts.length === 0 ? (
          <Text muted>Расхождений нет.</Text>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {report.conflicts.map((conflict) => (
              <li
                key={conflict.rowNumber}
                style={{ fontFamily: SANS, fontSize: 14, color: 'var(--pd-ink-secondary)' }}
              >
                Строка {conflict.rowNumber}: текст «{conflict.text}», заливка{' '}
                {conflict.fill ?? 'нет'}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Heading level={2} style={{ marginBottom: 8 }}>
        Совпадения ФИО
      </Heading>
      <Text muted style={{ marginBottom: 12 }}>
        Совпадение ФИО — не доказательство, что это один человек. Карточки заводятся по каждому
        написанию, а сведение остаётся ручным действием.
      </Text>
      <Card style={{ marginBottom: 28 }}>
        {report.duplicates.length === 0 ? (
          <Text muted>Совпадений нет.</Text>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {report.duplicates.map((group) => (
              <li
                key={group.normalizedName}
                style={{
                  fontFamily: SANS,
                  fontSize: 14,
                  color: 'var(--pd-ink-secondary)',
                  marginBottom: 6,
                }}
              >
                {group.spellings.join(' · ')} — {group.rowNumbers.length}{' '}
                {plural(group.rowNumbers.length, 'строка', 'строки', 'строк')} (
                {group.rowNumbers.join(', ')})
              </li>
            ))}
          </ul>
        )}
      </Card>

      {report.unresolvedTypes.length === 0 ? null : (
        <>
          <Heading level={2} style={{ marginBottom: 8 }}>
            Не сведено к справочнику
          </Heading>
          <Card style={{ marginBottom: 28 }}>
            <Text muted style={{ marginBottom: 12 }}>
              Эти написания не отнесены ни к одной позиции справочника. Строки с ними при фиксации
              будут отклонены с указанием причины: заведите позицию или псевдоним и загрузите
              книгу заново.
            </Text>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {report.unresolvedTypes.map((type) => (
                <li
                  key={type.spelling}
                  style={{ fontFamily: SANS, fontSize: 14, color: 'var(--pd-ink-secondary)' }}
                >
                  «{type.spelling}» — строки {type.rowNumbers.join(', ')}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Heading level={2} style={{ marginBottom: 12 }}>
        Строки книги
      </Heading>
      <Card style={{ marginBottom: 28, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">
                №
              </th>
              <th style={TABLE_HEAD} scope="col">
                Заказчик
              </th>
              <th style={TABLE_HEAD} scope="col">
                Тип работы
              </th>
              <th style={TABLE_HEAD} scope="col">
                Срок
              </th>
              <th style={TABLE_HEAD} scope="col">
                Стоимость
              </th>
              <th style={TABLE_HEAD} scope="col">
                Оплачено
              </th>
              <th style={TABLE_HEAD} scope="col">
                Состояние
              </th>
              <th style={TABLE_HEAD} scope="col">
                Решение
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.rowNumber}>
                <td style={TABLE_CELL}>{row.rowNumber}</td>
                <td style={TABLE_CELL}>{row.customer}</td>
                <td style={TABLE_CELL}>
                  {row.rawType}
                  {row.typeCode === null ? (
                    <div style={{ fontSize: 13, color: 'var(--pd-err-ink)' }}>не сведено</div>
                  ) : null}
                </td>
                <td style={TABLE_CELL}>{formatDate(row.deadline) ?? '—'}</td>
                <td style={TABLE_NUM}>{formatAmount(row.cost)}</td>
                <td style={TABLE_NUM}>{formatAmount(row.paid)}</td>
                <td style={TABLE_CELL}>
                  {row.statusLabel}
                  {row.issues.length === 0 ? null : (
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.issues.map((issue) => issue.label).join('; ')}
                    </div>
                  )}
                </td>
                <td style={TABLE_CELL}>
                  <Chip
                    tone={
                      row.action === 'SKIP' ? 'neutral' : row.severity === 'ERROR' ? 'warn' : 'accent'
                    }
                  >
                    {ACTION_LABEL[row.action]}
                  </Chip>
                  {row.existingCode === null ? null : (
                    <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                      {row.existingCode}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {applied ? (
        <Notice>
          Загрузка зафиксирована. Повторная фиксация невозможна: строки закрыты естественным
          ключом, и та же книга даёт пропуск, а не новые проекты.
        </Notice>
      ) : (
        <Card>
          <Heading level={2} style={{ marginBottom: 8 }}>
            Зафиксировать
          </Heading>
          <Text muted style={{ marginBottom: 16 }}>
            Записывается вся книга одной транзакцией. Учётные записи историческим клиентам не
            заводятся: создаются только карточки, и рассылки по ним не уходят.
          </Text>
          <form
            action={applyOrderBook}
            style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}
          >
            <input type="hidden" name="batchId" value={report.batchId} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span
                style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500, color: 'var(--pd-ink)' }}
              >
                Ведущий менеджер перенесённых проектов
              </span>
              <select
                name="managerId"
                required
                style={{
                  boxSizing: 'border-box',
                  width: '100%',
                  minHeight: 44,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--pd-edge-neutral)',
                  background: 'var(--pd-ink-inverse)',
                  color: 'var(--pd-ink)',
                  fontFamily: SANS,
                  fontSize: 16,
                }}
              >
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.fullName}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Исключить строки"
              name="excludeRows"
              placeholder="например: 12, 31"
              hint="Номера строк книги через запятую. Пусто — переносятся все."
            />
            <div>
              <Button type="submit">Зафиксировать загрузку</Button>
            </div>
          </form>
        </Card>
      )}

      {report.duplicates.length === 0 || !applied ? null : (
        <Card style={{ marginTop: 28 }}>
          <Heading level={2} style={{ marginBottom: 8 }}>
            Свести карточки
          </Heading>
          <Text muted style={{ marginBottom: 16 }}>
            Сведение переводит проекты на основную карточку. Прежняя не удаляется: на неё
            ссылаются журналы и требования об удалении данных субъекта.
          </Text>
          <form
            action={mergeClientCards}
            style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520 }}
          >
            <input type="hidden" name="batchId" value={report.batchId} />
            <Field label="Идентификатор карточки, которую сводим" name="sourceId" required />
            <Field label="Идентификатор основной карточки" name="targetId" required />
            <div>
              <Button type="submit" tone="quiet">
                Свести
              </Button>
            </div>
          </form>
        </Card>
      )}
    </Shell>
  );
}
