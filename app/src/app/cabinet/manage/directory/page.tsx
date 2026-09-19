import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { MONO } from '../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Mono,
  Notice,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  Text,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { listColorMap, listServiceTypes, listStageTemplates } from '../../../../lib/cabinet/admin';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';
import { attachAlias, detachAlias, dropStageTemplate, saveStageTemplate, saveType } from '../../actions';

export const dynamic = 'force-dynamic';

/** Пояснение к кнопке-чипу: крестик читалке ничего не говорит. */
const VISUALLY_HIDDEN_INLINE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
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
        <Form action={saveType}>
          <FormRow>
            <Field
              label="Код"
              name="code"
              required
              placeholder="translation"
              hint="Латиницей, без пробелов"
            />
            <Field label="Название" name="name" required placeholder="Научный перевод" />
            <Field label="Базовая цена" name="basePrice" placeholder="необязательно" />
            <Field label="Порядок" name="sortOrder" placeholder="70" />
          </FormRow>
          <FormActions>
            <Button>Сохранить</Button>
          </FormActions>
        </Form>
      </Card>

      <Card style={{ padding: 0, overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr>
              <th style={TABLE_HEAD} scope="col">Позиция</th>
              <th style={TABLE_HEAD} scope="col">Проектов</th>
              <th style={TABLE_HEAD} scope="col">Базовая цена</th>
              <th style={TABLE_HEAD} scope="col">Исторические написания</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr key={type.id}>
                <td style={TABLE_CELL}>
                  {type.name}
                  <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--pd-ink-muted)' }}>
                    {type.code}
                  </div>
                  {type.isActive ? null : <Chip tone="neutral">не действует</Chip>}
                </td>
                <td style={TABLE_CELL}>{type._count.projects}</td>
                <td style={TABLE_CELL}>
                  {type.basePrice === null ? (
                    <span style={{ color: 'var(--pd-ink-muted)' }}>не задана</span>
                  ) : (
                    formatAmount(type.basePrice)
                  )}
                </td>
                <td style={TABLE_CELL}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {type.aliases.length === 0 ? (
                      <span style={{ color: 'var(--pd-ink-muted)' }}>нет</span>
                    ) : (
                      type.aliases.map((alias) => (
                        <Form key={alias.id} action={detachAlias} inline>
                          <input type="hidden" name="aliasId" value={alias.id} />
                          <Button tone="chip">
                            <span>{alias.alias}</span>
                            <span aria-hidden="true">✕</span>
                            <span style={VISUALLY_HIDDEN_INLINE}>— убрать написание</span>
                          </Button>
                        </Form>
                      ))
                    )}
                  </div>
                  <Form action={attachAlias} inline>
                    <input type="hidden" name="serviceTypeId" value={type.id} />
                    <Field
                      label={`Историческое написание для позиции «${type.name}»`}
                      labelHidden
                      name="alias"
                      scope={type.id}
                      placeholder="написание из книги"
                      minWidth={200}
                      required
                    />
                    <Button tone="quiet">Привязать</Button>
                  </Form>
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
              <th style={TABLE_HEAD} scope="col">Тип сопровождения</th>
              <th style={TABLE_HEAD} scope="col">№</th>
              <th style={TABLE_HEAD} scope="col">Этап</th>
              <th style={TABLE_HEAD} scope="col">Длительность</th>
              <th style={TABLE_HEAD} scope="col">Действие</th>
            </tr>
          </thead>
          <tbody>
            {templates.length === 0 ? (
              <tr>
                <td style={TABLE_CELL} colSpan={5}>
                  Шаблонов нет. Пока их нет, менеджер заводит этапы вручную при одобрении заявки.
                </td>
              </tr>
            ) : (
              templates.map((item) => (
                <tr key={item.id}>
                  <td style={TABLE_CELL}>{item.serviceType.name}</td>
                  <td style={TABLE_CELL}>{item.position}</td>
                  <td style={TABLE_CELL}>{item.title}</td>
                  <td style={TABLE_CELL}>
                    {item.durationDays === null ? '—' : `${item.durationDays} дн.`}
                  </td>
                  <td style={TABLE_CELL}>
                    <Form action={dropStageTemplate} inline>
                      <input type="hidden" name="id" value={item.id} />
                      <Button tone="quiet">Убрать</Button>
                    </Form>
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
        <Form action={saveStageTemplate}>
          <FormRow>
            <Select label="Тип сопровождения" name="serviceTypeId" scope="template" required>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
            <Field
              label="Порядковый номер"
              name="position"
              scope="template"
              required
              placeholder="1"
            />
            <Field
              label="Название этапа"
              name="title"
              scope="template"
              required
              placeholder="Постановка задачи"
            />
            <Field
              label="Длительность, дней"
              name="durationDays"
              scope="template"
              placeholder="необязательно"
            />
          </FormRow>
          <FormActions>
            <Button>Сохранить</Button>
          </FormActions>
        </Form>
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
              <th style={TABLE_HEAD} scope="col">Цвет</th>
              <th style={TABLE_HEAD} scope="col">Код</th>
              <th style={TABLE_HEAD} scope="col">Значение</th>
            </tr>
          </thead>
          <tbody>
            {colors.map((color) => (
              <tr key={color.argb}>
                <td style={TABLE_CELL}>
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
                <td style={{ ...TABLE_CELL, fontFamily: MONO }}>{color.argb}</td>
                <td style={TABLE_CELL}>{color.description ?? color.mapsTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Shell>
  );
}
