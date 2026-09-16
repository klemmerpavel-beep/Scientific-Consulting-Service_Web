import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { SANS } from '../../../../components/cabinet/tokens';
import { Button, Card, Chip, Field, Heading, Mono, Notice, Text } from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { listColorMap, listServiceTypes, listStageTemplates } from '../../../../lib/cabinet/admin';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';
import { attachAlias, detachAlias, dropStageTemplate, saveStageTemplate, saveType } from '../../actions';

export const dynamic = 'force-dynamic';

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

const field: React.CSSProperties = {
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--pd-edge-neutral)',
  background: 'var(--pd-ink-inverse)',
  color: 'var(--pd-ink)',
  fontFamily: SANS,
  fontSize: 16,
};

export default async function DirectoryScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'DIRECTORY_EDIT')) redirect('/cabinet/projects');

  const flags = await searchParams;
  const [types, colors, templates] = await Promise.all([
    listServiceTypes(actor),
    listColorMap(actor),
    listStageTemplates(actor),
  ]);

  return (
    <Shell actor={actor} current="/cabinet/manage/directory">
      <Mono>Справочники</Mono>
      <Heading level={1} style={{ margin: '12px 0 8px' }}>
        Типы сопровождения
      </Heading>
      <Text muted style={{ marginBottom: 24 }}>
        Позиция справочника — то, во что сводятся исторические написания при переносе книги заказов
        и на что опирается аналитика продуктов. Базовые цены не заполнены: прайс не утверждён, а
        поле, заполненное догадкой, хуже пустого.
      </Text>

      {flags.error === undefined ? null : (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="error" role="alert">
            {decodeURIComponent(flags.error)}
          </Notice>
        </div>
      )}

      <Card style={{ marginBottom: 32 }}>
        <Heading level={2} style={{ marginBottom: 12 }}>
          Добавить позицию
        </Heading>
        <form action={saveType} style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', alignItems: 'end' }}>
          <Field label="Код" name="code" required placeholder="translation" hint="Латиницей, без пробелов" />
          <Field label="Название" name="name" required placeholder="Научный перевод" />
          <Field label="Базовая цена" name="basePrice" placeholder="необязательно" />
          <Field label="Порядок" name="sortOrder" placeholder="70" />
          <div>
            <Button type="submit">Сохранить</Button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr>
              <th style={head} scope="col">Позиция</th>
              <th style={head} scope="col">Проектов</th>
              <th style={head} scope="col">Базовая цена</th>
              <th style={head} scope="col">Исторические написания</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type.id}>
                <td style={cell}>
                  {type.name}
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                    {type.code}
                  </div>
                  {type.isActive ? null : <Chip tone="neutral">не действует</Chip>}
                </td>
                <td style={cell}>{type._count.projects}</td>
                <td style={cell}>
                  {type.basePrice === null ? (
                    <span style={{ color: 'var(--pd-ink-muted)' }}>не задана</span>
                  ) : (
                    formatAmount(type.basePrice)
                  )}
                </td>
                <td style={cell}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {type.aliases.length === 0 ? (
                      <span style={{ color: 'var(--pd-ink-muted)' }}>нет</span>
                    ) : (
                      type.aliases.map((alias) => (
                        <form key={alias.id} action={detachAlias}>
                          <input type="hidden" name="aliasId" value={alias.id} />
                          <button
                            type="submit"
                            title="Убрать написание"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              minHeight: 44,
                              padding: '0 14px',
                              borderRadius: 999,
                              border: '1px solid var(--pd-border)',
                              background: 'var(--pd-surface-quiet)',
                              color: 'var(--pd-ink-secondary)',
                              fontFamily: SANS,
                              fontSize: 13,
                              cursor: 'pointer',
                            }}
                          >
                            {alias.alias} ✕
                          </button>
                        </form>
                      ))
                    )}
                  </div>
                  <form action={attachAlias} style={{ display: 'flex', gap: 8 }}>
                    <input type="hidden" name="serviceTypeId" value={type.id} />
                    <input
                      name="alias"
                      placeholder="написание из книги"
                      style={{ ...field, minWidth: 200 }}
                      required
                    />
                    <Button type="submit" tone="quiet">
                      Привязать
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Heading level={2} style={{ marginBottom: 8 }}>
        Шаблоны этапов
      </Heading>
      <Text muted style={{ marginBottom: 12 }}>
        Шаблон применяется при одобрении заявки и копирует строки в этапы проекта. Правка шаблона
        задним числом живые проекты не переписывает: иначе изменение методики меняло бы план работ
        у тех, кто уже в работе.
      </Text>
      <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={head} scope="col">Тип сопровождения</th>
              <th style={head} scope="col">№</th>
              <th style={head} scope="col">Этап</th>
              <th style={head} scope="col">Длительность</th>
              <th style={head} scope="col">Действие</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td style={cell} colSpan={5}>
                  Шаблонов нет. Пока их нет, менеджер заводит этапы вручную при одобрении заявки.
                </td>
              </tr>
            ) : (
              templates.map((item) => (
                <tr key={item.id}>
                  <td style={cell}>{item.serviceType.name}</td>
                  <td style={cell}>{item.position}</td>
                  <td style={cell}>{item.title}</td>
                  <td style={cell}>
                    {item.durationDays === null ? '—' : `${item.durationDays} дн.`}
                  </td>
                  <td style={cell}>
                    <form action={dropStageTemplate}>
                      <input type="hidden" name="id" value={item.id} />
                      <Button type="submit" tone="quiet">
                        Убрать
                      </Button>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card style={{ marginBottom: 32 }}>
        <Heading level={3} style={{ marginBottom: 12 }}>
          Добавить этап в шаблон
        </Heading>
        <form
          action={saveStageTemplate}
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>Тип сопровождения</span>
            <select name="serviceTypeId" required style={field}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="Порядковый номер" name="position" required placeholder="1" />
          <Field label="Название этапа" name="title" required placeholder="Постановка задачи" />
          <Field label="Длительность, дней" name="durationDays" placeholder="необязательно" />
          <div>
            <Button type="submit">Сохранить</Button>
          </div>
        </form>
        <Text muted size={13} style={{ marginTop: 12 }}>
          Этап с тем же номером в пределах типа перезаписывается — так правится название, не ломая
          порядок.
        </Text>
      </Card>

      <Heading level={2} style={{ marginBottom: 12 }}>
        Заливка книги заказов
      </Heading>
      <Text muted style={{ marginBottom: 12 }}>
        Подсказка для предпросмотра, а не решение: состояние работы берётся по тексту статуса, а
        расхождение с цветом выводится отдельным перечнем.
      </Text>
      <Card style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              <th style={head} scope="col">Цвет</th>
              <th style={head} scope="col">Код</th>
              <th style={head} scope="col">Значение</th>
            </tr>
          </thead>
          <tbody>
            {colors.map((color) => (
              <tr key={color.argb}>
                <td style={cell}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      border: '1px solid var(--pd-border)',
                      background: `#${color.argb.slice(2)}`,
                    }}
                  />
                </td>
                <td style={{ ...cell, fontFamily: 'monospace' }}>{color.argb}</td>
                <td style={cell}>{color.description ?? color.mapsTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Shell>
  );
}
