import { flashText } from '../../../../lib/cabinet/flash';
import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { MONO } from '../../../../components/cabinet/tokens';
import {
  Button,
  Card,
  Chip,
  Disclosure,
  DropMark,
  Empty,
  Field,
  Form,
  FormActions,
  FormRow,
  Heading,
  Outcome,
  ScreenHead,
  Select,
  TABLE_CELL,
  TABLE_HEAD,
  TABLE_NUM,
  TableCard,
  FilterBar,
  Tabs,
  Text,
} from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { listColorMap, listServiceTypes, listStageTemplates } from '../../../../lib/cabinet/admin';
import { formatAmount } from '../../../../lib/cabinet/money';
import { currentActor } from '../../../../lib/cabinet/session';
import { attachAlias, detachAlias, dropStageTemplate, saveStageTemplate, saveType } from '../../actions';

export const dynamic = 'force-dynamic';

/** Пояснение к кнопке-чипу: значок читалке ничего не говорит. */
const VISUALLY_HIDDEN_INLINE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

type Tab = 'types' | 'stages' | 'colors';

const TABS: readonly Tab[] = ['types', 'stages', 'colors'];

/**
 * Справочники: типы сопровождения, шаблоны этапов и заливка книги.
 *
 * Три раздела стояли на одном экране друг под другом и давали две с
 * половиной страницы прокрутки; решение Р-173 развело так же реестры и
 * прямо отложило справочники. Очередь дошла: разделы разведены вкладками,
 * и выборка идёт только по открытой — два лишних запроса к базе на каждом
 * открытии экрана исчезают (решение Р-177).
 *
 * Формы добавления убраны под свёртку: позицию справочника заводят раз в
 * полгода, а место они занимали постоянно.
 */
export default async function DirectoryScreen({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');
  if (!can(actor, 'DIRECTORY_EDIT')) redirect('/cabinet/projects');

  const sp = await searchParams;
  // Причина отказа — по метке из одноразовой cookie, не из адреса (Р-243).
  const failure = await flashText(sp.error);
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'types';

  // Типы нужны и вкладке шаблонов — выбором в форме. Остальные выборки
  // идут только там, где их показывают.
  const types = tab === 'types' || tab === 'stages' ? await listServiceTypes(actor) : [];
  const templates = tab === 'stages' ? await listStageTemplates(actor) : [];
  const colors = tab === 'colors' ? await listColorMap(actor) : [];

  const href = (next: Tab) =>
    next === 'types' ? '/cabinet/manage/directory' : `/cabinet/manage/directory?tab=${next}`;

  return (
    <Shell actor={actor} current="/cabinet/manage/directory">
      <ScreenHead
        title="Справочники"
        note="Позиция справочника — то, во что сводятся исторические написания при переносе книги заказов и на что опирается аналитика продуктов."
      />

      <FilterBar>
        <Tabs
          flush
          label="Разделы справочников"
          items={[
            { href: href('types'), label: 'Типы сопровождения', active: tab === 'types' },
            { href: href('stages'), label: 'Шаблоны этапов', active: tab === 'stages' },
            { href: href('colors'), label: 'Заливка книги', active: tab === 'colors' },
          ]}
        />
      </FilterBar>

      {failure === undefined ? null : (
        <Outcome tone="error">
          {failure}
        </Outcome>
      )}

      {tab === 'types' ? (
        <>
          <TableCard label="Типы сопровождения">
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
                    <td style={TABLE_NUM}>{type._count.projects}</td>
                    <td style={TABLE_CELL}>
                      {type.basePrice === null ? (
                        <span style={{ color: 'var(--pd-ink-muted)' }}>не задана</span>
                      ) : (
                        formatAmount(type.basePrice)
                      )}
                    </td>
                    <td style={TABLE_CELL}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {type.aliases.length === 0 ? (
                          <span style={{ color: 'var(--pd-ink-muted)' }}>нет</span>
                        ) : (
                          type.aliases.map((alias) => (
                            <Form key={alias.id} action={detachAlias} inline>
                              <input type="hidden" name="aliasId" value={alias.id} />
                              <Button tone="chip">
                                <span>{alias.alias}</span>
                                <DropMark />
                                <span style={VISUALLY_HIDDEN_INLINE}>— убрать написание</span>
                              </Button>
                            </Form>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <Text muted size={13} style={{ marginTop: 12, marginBottom: 12 }}>
            Базовые цены не заполнены: прайс не утверждён, а поле, заполненное догадкой, хуже
            пустого.
          </Text>

          {/* Привязка написания стояла формой в каждой строке таблицы, и
              строка вырастала до ста двух пикселей. Здесь форма одна, а
              позиция выбирается списком (решение Р-184). */}
          <Disclosure title="Привязать историческое написание" style={{ marginBottom: 12 }}>
            <Form action={attachAlias}>
              <FormRow>
                <Select label="Позиция справочника" name="serviceTypeId" required>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </Select>
                <Field
                  label="Написание из книги заказов"
                  name="alias"
                  required
                  placeholder="Диссертция"
                  hint="Так, как оно встречается в исходном файле, — с опечаткой, если она там есть."
                />
              </FormRow>
              <FormActions>
                <Button>Привязать</Button>
              </FormActions>
            </Form>
          </Disclosure>

          <Disclosure title="Добавить позицию">
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
          </Disclosure>
        </>
      ) : null}

      {tab === 'stages' ? (
        <>
          {templates.length === 0 ? (
            <Empty title="Шаблонов нет">
              Пока их нет, менеджер заводит этапы вручную на экране работы после одобрения заявки.
            </Empty>
          ) : (
            <TableCard label="Шаблоны этапов">
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
                  {templates.map((item) => (
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
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}

          <Text muted size={13} style={{ marginTop: 12, marginBottom: 12 }}>
            Шаблон применяется при одобрении заявки и копирует строки в этапы проекта. Правка
            шаблона задним числом живые проекты не переписывает: иначе изменение методики меняло бы
            план работ у тех, кто уже в работе.
          </Text>

          <Disclosure title="Добавить этап в шаблон">
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
                <Button tone="quiet">Сохранить</Button>
              </FormActions>
              <Text muted size={13} style={{ marginTop: 12 }}>
                Этап с тем же номером в пределах типа перезаписывается — так правится название, не
                ломая порядок.
              </Text>
            </Form>
          </Disclosure>
        </>
      ) : null}

      {tab === 'colors' ? (
        <>
          <TableCard label="Заливка книги заказов">
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
          </TableCard>
          <Text muted size={13} style={{ marginTop: 12 }}>
            Подсказка для предпросмотра, а не решение: состояние работы берётся по тексту статуса, а
            расхождение с цветом выводится отдельным перечнем.
          </Text>
        </>
      ) : null}
    </Shell>
  );
}
