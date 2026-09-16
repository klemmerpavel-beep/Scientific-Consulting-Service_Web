import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import { Button, Card, Chip, Empty, Heading, Mono, Notice, Text, formatDate } from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { listBatches } from '../../../../lib/cabinet/import/apply';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';
import { uploadOrderBook } from '../../actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  empty: 'Файл не выбран или пуст.',
  EMPTY: 'Файл пуст.',
  NOT_ZIP: 'Это не книга Excel: файл не является архивом. Ожидается .xlsx, а не .xls и не .csv.',
  NOT_XLSX: 'В архиве нет листов книги. Возможно, файл повреждён.',
  EMPTY_HEADER: 'В книге не нашлось строки заголовка с колонками «Заказчик», «Стоимость», «Оплачено».',
  UNSUPPORTED: 'Книгу разобрать не удалось.',
};

const STATE_LABEL: Record<string, string> = {
  PARSED: 'разобрана',
  PREVIEWED: 'предпросмотр',
  APPLIED: 'зафиксирована',
  CANCELLED: 'отменена',
};

const cell: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--pd-divider)',
  fontFamily: SANS,
  fontSize: 14,
  color: 'var(--pd-ink-secondary)',
  textAlign: 'left',
  verticalAlign: 'top',
};

const head: React.CSSProperties = {
  ...cell,
  fontWeight: 500,
  color: 'var(--pd-ink)',
  background: 'var(--pd-surface-quiet)',
  whiteSpace: 'nowrap',
};

export default async function ImportScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  // Перенос исторических данных ведёт руководитель: менеджеру раздел закрыт.
  if (!can(actor, 'IMPORT_RUN')) redirect('/cabinet/projects');

  const { error } = await searchParams;
  const batches = await listBatches(actor);

  return (
    <Shell actor={actor} current="/cabinet/manage/import">
      <Mono>Перенос истории</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        Книга заказов
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        Книга разбирается вместе с заливкой ячеек: статус работы в исходном файле закодирован
        цветом. Ведущим признаком принят текст статуса, расхождения с цветом выводятся отдельным
        перечнем. Ни один проект не заводится до того, как отчёт прочитан и фиксация подтверждена.
      </Text>

      {error === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="error" role="alert">
            {ERRORS[error] ?? ERRORS.UNSUPPORTED}
          </Notice>
        </div>
      )}

      <Card style={{ marginBottom: 32 }}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Загрузить книгу
        </Heading>
        <form action={uploadOrderBook} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500, color: 'var(--pd-ink)' }}
            >
              Файл .xlsx
            </span>
            <input
              type="file"
              name="book"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            />
            <span style={{ fontFamily: SANS, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
              Строка заголовка ищется по колонкам «Заказчик», «Тип работы», «Стоимость»,
              «Оплачено»; пустые строки сверху разбору не мешают.
            </span>
          </label>
          <div>
            <Button type="submit">Разобрать и показать отчёт</Button>
          </div>
        </form>
      </Card>

      <Heading level={2} style={{ marginBottom: 12 }}>
        Загрузки
      </Heading>

      {batches.length === 0 ? (
        <Empty title="Загрузок ещё не было">
          Первая загрузка покажет отчёт со всеми расхождениями исходного файла.
        </Empty>
      ) : (
        <Card style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <caption style={{ ...cell, captionSide: 'top', borderBottom: 'none' }}>
              История переносов: отчёт каждой загрузки открывается повторно.
            </caption>
            <thead>
              <tr>
                <th style={head} scope="col">
                  Файл
                </th>
                <th style={head} scope="col">
                  Загружена
                </th>
                <th style={head} scope="col">
                  Состояние
                </th>
                <th style={head} scope="col">
                  Строк
                </th>
                <th style={head} scope="col">
                  Суммы
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const stats = (batch.stats ?? {}) as { cost?: string; paid?: string };
                return (
                  <tr key={batch.id}>
                    <td style={cell}>
                      <a href={`/cabinet/manage/import/${batch.id}`}>{batch.fileName}</a>
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        {batch.uploadedBy.fullName}
                      </div>
                    </td>
                    <td style={cell}>{formatDate(batch.createdAt)}</td>
                    <td style={cell}>
                      <Chip tone={batch.state === 'APPLIED' ? 'ok' : 'neutral'}>
                        {STATE_LABEL[batch.state] ?? batch.state}
                      </Chip>
                    </td>
                    <td style={cell}>{batch._count.rows}</td>
                    <td style={cell}>
                      {stats.cost === undefined
                        ? '—'
                        : `${formatAmount(BigInt(stats.cost))} / ${formatAmount(
                            BigInt(stats.paid ?? '0'),
                          )}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </Shell>
  );
}
