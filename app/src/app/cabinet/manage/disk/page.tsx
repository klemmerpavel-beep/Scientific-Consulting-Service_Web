import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Card,
  Heading,
  ScreenHead,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TABLE_NUM_HEAD,
  TableCard,
  Text,
  Tile,
  Tiles,
  formatDate,
  formatTime,
  plural,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { diskStatus } from '../../../../lib/cabinet/disk-status';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Зеркало практики на облачном диске: работает ли оно и что ушло.
 *
 * Кабинет — рабочее место и отвечает на вопрос «что сейчас»; диск — то,
 * что открывается с телефона без входа, отдаётся бухгалтеру одной папкой
 * и переживает сервер. Пока о зеркале было известно только из журнала
 * процесса на сервере, руководитель не мог сказать, идёт ли выгрузка
 * вообще (решение Р-196).
 */
export default async function DiskScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'AUDIT_VIEW')) redirect('/cabinet/projects');

  const status = await diskStatus(actor);
  const last = status.last;

  return (
    <Shell actor={actor} current="/cabinet/manage/tools">
      <ScreenHead
        backHref="/cabinet/manage/tools"
        backLabel="к служебным разделам"
        title="Зеркало на облачном диске"
        note="Таблицы реестров и файлы материалов уходят на диск раз в час. Читается только в одну сторону: правка на диске в кабинет не вернётся и будет затёрта ближайшим прогоном."
      />

      {/* Выключенное зеркало — это состояние, а не сбой: красный блок
          ошибки говорил бы, что сломалось то, чего ещё не включали
          (решение Р-196). */}
      {status.configured ? null : (
        <Card style={{ marginBottom: 20 }}>
          <Heading level={2} size={3} style={{ marginBottom: 8 }}>
            Зеркало выключено
          </Heading>
          <Text size={14}>
            Доступ к диску на сервере не задан, и выгрузка не идёт. Заведите пароль приложения в
            учётной записи диска и впишите его в настройки развёртывания — порядок описан в
            разделе «Зеркало практики» руководства по развёртыванию.
          </Text>
        </Card>
      )}

      <Tiles>
        <Tile
          label="Последняя выгрузка"
          value={last === null ? '—' : formatDate(last.occurredAt) ?? '—'}
          note={last === null ? 'прогонов ещё не было' : `в ${formatTime(last.occurredAt)} по Москве`}
        />
        <Tile
          label="Файлов в зеркале"
          value={last === null ? '—' : String(last.files)}
          note={status.scope === 'tables' ? 'только таблицы реестров' : 'таблицы и материалы работ'}
        />
        <Tile
          label="Ушло в последний раз"
          value={last === null ? '—' : String(last.uploaded)}
          note={
            last === null
              ? 'нет данных'
              : `${last.removed} ${plural(last.removed, 'удалён', 'удалено', 'удалено')}`
          }
        />
        <Tile
          label="Ошибок"
          value={last === null ? '—' : String(last.failed)}
          note={last === null || last.failed === 0 ? 'последний прогон чистый' : 'разберите журнал прогона'}
        />
      </Tiles>

      <Card style={{ marginBottom: 24 }}>
        <Heading level={2} size={3} style={{ marginBottom: 10 }}>
          Куда выгружается
        </Heading>
        <Text size={14}>
          Папка «{status.folder}» на {status.host.replace(/^https?:\/\//u, '')}.{' '}
          {status.scope === 'tables'
            ? 'Уходят только таблицы реестров: файлы материалов остаются на сервере.'
            : 'Уходят таблицы реестров и файлы материалов работ.'}
        </Text>
        <Text muted size={13} style={{ marginTop: 10 }}>
          Материал, изъятый в кабинете или удалённый по требованию субъекта, исчезает с диска
          ближайшим прогоном: зеркало без удаления оставляло бы в облаке копию, о которой никто
          не помнит.
        </Text>
      </Card>

      {status.runs.length === 0 ? (
        <Text muted>Прогонов ещё не было: как только выгрузка пойдёт, здесь появится история.</Text>
      ) : (
        <TableCard label="Последние прогоны">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={TABLE_HEAD} scope="col">Когда</th>
                <th style={TABLE_NUM_HEAD} scope="col">Ушло</th>
                <th style={TABLE_NUM_HEAD} scope="col">Удалено</th>
                <th style={TABLE_NUM_HEAD} scope="col">В зеркале</th>
                <th style={TABLE_NUM_HEAD} scope="col">Ошибок</th>
              </tr>
            </thead>
            <tbody>
              {status.runs.map((run) => (
                <tr key={run.occurredAt.toISOString()}>
                  <td style={TABLE_CELL}>
                    {formatDate(run.occurredAt)}, {formatTime(run.occurredAt)}
                  </td>
                  <td style={TABLE_NUM}>{run.uploaded}</td>
                  <td style={TABLE_NUM}>{run.removed}</td>
                  <td style={TABLE_NUM}>{run.files}</td>
                  <td style={TABLE_NUM}>{run.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}
    </Shell>
  );
}
