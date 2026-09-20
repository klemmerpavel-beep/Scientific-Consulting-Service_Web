import { notFound, redirect } from 'next/navigation';

import Shell from '../../../../../components/cabinet/Shell';
import { SANS } from '../../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Disclosure,
  Field,
  Form,
  FormActions,
  Heading,
  LongTable,
  Notice,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TableCard,
  Text,
  Tile,
  Tiles,
  formatDate,
  plural,
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

  // Номера строк и человекочитаемое название собираются одним обходом:
  // прежде перечень строился заново на каждый класс замечания, то есть
  // книга обходилась столько раз, сколько классов (решение Р-177).
  const byIssue = new Map<string, { label: string; rows: number[] }>();
  for (const row of report.rows) {
    for (const issue of row.issues) {
      const seen = byIssue.get(issue.code) ?? { label: issue.label, rows: [] };
      seen.rows.push(row.rowNumber);
      byIssue.set(issue.code, seen);
    }
  }

  const tiles = [
    { label: 'Строк в книге', value: String(report.rows.length) },
    { label: 'Законтрактовано', value: formatAmount(report.totals.cost) },
    { label: 'Получено', value: formatAmount(report.totals.paid) },
    { label: 'Остаток', value: formatAmount(report.totals.cost - report.totals.paid) },
  ];

  return (
    <Shell actor={actor} current="/cabinet/manage/import">
      <ScreenHead
        backHref="/cabinet/manage/import"
        backLabel="к загрузкам"
        title={report.fileName}
        note={`Лист «${report.sheet}», загружена ${formatDate(report.createdAt)}. К заведению ${report.counts.CREATE}, к обновлению ${report.counts.UPDATE}, уже перенесено ${report.counts.SKIP}.`}
      />

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

      {/* Плитка живёт общей частью: своя копия разошлась бы с прочими
          по кеглю и весу числа при первой же правке (решение Р-177). */}
      <Tiles>
        {tiles.map((tile) => (
          <Tile key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </Tiles>

      <Heading level={2} style={{ marginBottom: 12 }}>
        Замечания разбора
      </Heading>
      {issues.length === 0 ? (
        <Card style={{ marginBottom: 28 }}>
          <Text muted>Замечаний нет: книга разобрана без расхождений.</Text>
        </Card>
      ) : (
        <TableCard label="Замечания разбора" style={{ marginBottom: 28 }}>
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
                const seen = byIssue.get(code);
                return (
                  <tr key={code}>
                    <td style={TABLE_CELL}>{seen?.label ?? code}</td>
                    <td style={TABLE_NUM}>{count}</td>
                    <td style={TABLE_CELL}>{(seen?.rows ?? []).join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* Три перечня ниже — разбор частностей: в них заходят, когда в
          таблице замечаний увиделось расхождение. Раскрытыми они давали
          треть высоты экрана, поэтому сомкнуты (решение Р-177). Таблица
          замечаний выше остаётся на виду: из неё берутся номера строк для
          поля «Исключить строки». */}
      <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
        <Disclosure
          title={`Цвет против текста: ${report.conflicts.length} ${plural(report.conflicts.length, 'расхождение', 'расхождения', 'расхождений')}`}
        >
          <Text muted size={13} style={{ marginBottom: 10 }}>
            Состояние работы берётся по тексту статуса. Заливка сохранена и показана рядом: выбор
            между «работа доведена» и «работа идёт» остаётся за руководителем.
          </Text>
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
        </Disclosure>

        <Disclosure
          title={`Совпадения ФИО: ${report.duplicates.length} ${plural(report.duplicates.length, 'группа', 'группы', 'групп')}`}
        >
          <Text muted size={13} style={{ marginBottom: 10 }}>
            Совпадение ФИО — не доказательство, что это один человек. Карточки заводятся по
            каждому написанию, а сведение остаётся ручным действием.
          </Text>
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
        </Disclosure>

        {report.unresolvedTypes.length === 0 ? null : (
          <Disclosure
            title={`Не сведено к справочнику: ${report.unresolvedTypes.length} ${plural(report.unresolvedTypes.length, 'написание', 'написания', 'написаний')}`}
          >
            <Text muted size={13} style={{ marginBottom: 10 }}>
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
          </Disclosure>
        )}
      </div>

      <Heading level={2} style={{ marginBottom: 12 }}>
        Строки книги
      </Heading>
      {/* Первые десять строк на виду, остаток раскрывается на месте:
          на настоящей книге в полсотни заказов таблица целиком давала
          около шести тысяч пикселей (решение Р-177). Номера строк для
          поля «Исключить строки» берутся из таблицы замечаний выше. */}
      <div style={{ marginBottom: 28 }}>
        <LongTable
          label="Строки книги"
          minWidth={880}
          columns={
            <tr>
              <th style={TABLE_HEAD} scope="col">№</th>
              <th style={TABLE_HEAD} scope="col">Заказчик</th>
              <th style={TABLE_HEAD} scope="col">Тип работы</th>
              <th style={TABLE_HEAD} scope="col">Срок</th>
              <th style={TABLE_HEAD} scope="col">Стоимость</th>
              <th style={TABLE_HEAD} scope="col">Оплачено</th>
              <th style={TABLE_HEAD} scope="col">Состояние</th>
              <th style={TABLE_HEAD} scope="col">Решение</th>
            </tr>
          }
          rows={report.rows.map((row) => (
            <tr key={row.rowNumber}>
              <td style={TABLE_CELL}>{row.rowNumber}</td>
              <td style={TABLE_CELL}>{row.customer}</td>
              <td style={TABLE_CELL}>
                {row.rawType}
                {row.typeCode === null ? ' · не сведено' : ''}
              </td>
              <td style={TABLE_CELL}>{formatDate(row.deadline) ?? '—'}</td>
              <td style={TABLE_NUM}>{formatAmount(row.cost)}</td>
              <td style={TABLE_NUM}>{formatAmount(row.paid)}</td>
              <td style={TABLE_CELL}>
                {row.statusLabel}
                {row.issues.length === 0
                  ? ''
                  : ` · ${row.issues.map((issue) => issue.label).join('; ')}`}
              </td>
              <td style={TABLE_CELL}>
                <Chip tone={row.action === 'SKIP' ? 'neutral' : 'accent'}>
                  {ACTION_LABEL[row.action]}
                </Chip>
                {row.existingCode === null ? '' : ` ${row.existingCode}`}
              </td>
            </tr>
          ))}
        />
      </div>

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
          <Form action={applyOrderBook} style={{ maxWidth: 520 }}>
            <input type="hidden" name="batchId" value={report.batchId} />
            <Select label="Ведущий менеджер перенесённых проектов" name="managerId" required>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName}
                </option>
              ))}
            </Select>
            <Field
              label="Исключить строки"
              name="excludeRows"
              placeholder="например: 12, 31"
              hint="Номера строк книги через запятую. Пусто — переносятся все."
            />
            <FormActions>
              <Button>Зафиксировать загрузку</Button>
            </FormActions>
          </Form>
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
          <Form action={mergeClientCards} style={{ maxWidth: 520 }}>
            <input type="hidden" name="batchId" value={report.batchId} />
            <Field label="Идентификатор карточки, которую сводим" name="sourceId" required />
            <Field label="Идентификатор основной карточки" name="targetId" required />
            <FormActions>
              <Button tone="quiet">Свести</Button>
            </FormActions>
          </Form>
        </Card>
      )}
    </Shell>
  );
}
