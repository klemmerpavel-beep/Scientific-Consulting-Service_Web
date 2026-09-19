import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Chip,
  Empty,
  FileField,
  Form,
  FormActions,
  Heading,
  Mono,
  Notice,
  TABLE_CELL,
  TABLE_HEAD,
  Text,
  formatDate,
} from '../../../../components/cabinet/ui';
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
        <Form action={uploadOrderBook} encType="multipart/form-data">
          <FileField
            label="Файл .xlsx"
            name="book"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            hint="Строка заголовка ищется по колонкам «Заказчик», «Тип работы», «Стоимость», «Оплачено»; пустые строки сверху разбору не мешают."
          />
          <FormActions>
            <Button>Разобрать и показать отчёт</Button>
          </FormActions>
        </Form>
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
            <caption style={{ ...TABLE_CELL, captionSide: 'top', borderBottom: 'none' }}>
              История переносов: отчёт каждой загрузки открывается повторно.
            </caption>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">
                  Файл
                </th>
                <th style={TABLE_HEAD} scope="col">
                  Загружена
                </th>
                <th style={TABLE_HEAD} scope="col">
                  Состояние
                </th>
                <th style={TABLE_HEAD} scope="col">
                  Строк
                </th>
                <th style={TABLE_HEAD} scope="col">
                  Суммы
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const stats = (batch.stats ?? {}) as { cost?: string; paid?: string };
                return (
                  <tr key={batch.id}>
                    <td style={TABLE_CELL}>
                      <a href={`/cabinet/manage/import/${batch.id}`}>{batch.fileName}</a>
                      <div style={{ fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                        {batch.uploadedBy.fullName}
                      </div>
                    </td>
                    <td style={TABLE_CELL}>{formatDate(batch.createdAt)}</td>
                    <td style={TABLE_CELL}>
                      <Chip tone={batch.state === 'APPLIED' ? 'accent' : 'neutral'}>
                        {STATE_LABEL[batch.state] ?? batch.state}
                      </Chip>
                    </td>
                    <td style={TABLE_CELL}>{batch._count.rows}</td>
                    <td style={TABLE_CELL}>
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
