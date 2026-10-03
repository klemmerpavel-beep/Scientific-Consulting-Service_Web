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
import {
  listCalendarDays,
  listColorMap,
  listServiceTypes,
  listStageTemplates,
} from '../../../../lib/cabinet/admin';
import { formatDay } from '../../../../lib/cabinet/approval';
import { formatAmount } from '../../../../lib/cabinet/money';
import { requireActor } from '../../../../lib/cabinet/session';
import { homeFor } from '../../../../lib/cabinet/nav';
import {
  attachAlias,
  detachAlias,
  dropCalendarDay,
  dropStageTemplate,
  saveCalendar,
  saveStageTemplate,
  saveType,
} from '../../actions';

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

type Tab = 'types' | 'stages' | 'colors' | 'calendar';

const TABS: readonly Tab[] = ['types', 'stages', 'colors', 'calendar'];

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
  const actor = await requireActor('/cabinet/manage/directory');
  if (!can(actor, 'DIRECTORY_EDIT')) redirect(homeFor(actor));

  const sp = await searchParams;
  // Причина отказа — по метке из одноразовой cookie, не из адреса (Р-243).
  const failure = await flashText(sp.error);
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'types';

  // Типы нужны и вкладке шаблонов — выбором в форме. Остальные выборки
  // идут только там, где их показывают.
  const types = tab === 'types' || tab === 'stages' ? await listServiceTypes(actor) : [];
  const templates = tab === 'stages' ? await listStageTemplates(actor) : [];
  const colors = tab === 'colors' ? await listColorMap(actor) : [];
  const calendar = tab === 'calendar' ? await listCalendarDays(actor) : [];

  const href = (next: Tab) =>
    next === 'types' ? '/cabinet/manage/directory' : `/cabinet/manage/directory?tab=${next}`;

  return (
    <Shell actor={actor} current="/cabinet/manage/directory">
      <ScreenHead
        title="Справочники"
        note="Справочники задают единые названия, которыми кабинет пользуется везде. Типы сопровождения — перечень видов работ: из него выбирают вид при одобрении заявки, по нему считается аналитика. Исторические написания — как тот же вид записан в книге заказов («Диссертция», «Статья ВАК»): при переносе книги такие строки сами сводятся к нужной позиции. Шаблоны этапов — готовый план работ для вида, который заводится в работу одним действием. Заливка книги — что означает цвет строки в книге заказов. Производственный календарь — переносы выходных, по которым считается срок согласования этапа. Заходить сюда нужно редко: когда появляется новый вид работ или перенос книги сообщает о несведённом написании."
      />

      <FilterBar>
        <Tabs
          flush
          label="Разделы справочников"
          items={[
            { href: href('types'), label: 'Типы сопровождения', active: tab === 'types' },
            { href: href('stages'), label: 'Шаблоны этапов', active: tab === 'stages' },
            { href: href('colors'), label: 'Заливка книги', active: tab === 'colors' },
            // Срок согласования этапа считается в рабочих днях (Т-15, Р-290).
            { href: href('calendar'), label: 'Производственный календарь', active: tab === 'calendar' },
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
            По этой таблице перенос определяет состояние работы: цвет строки ведёт, текст статуса
            решает только у строк без заливки. Расхождение цвета с текстом выводится отдельным
            перечнем предпросмотра.
          </Text>
        </>
      ) : null}

      {/* Производственный календарь для срока согласования этапа: правило —
          понедельник–пятница без праздников ст. 112 ТК РФ, здесь — только
          расхождения с ним (требование Т-15, решение Р-290). */}
      {tab === 'calendar' ? (
        <>
          {calendar.length === 0 ? (
            <Empty title="Переносов нет">
              Срок согласования считается по правилу: понедельник–пятница без нерабочих праздничных
              дней ст. 112 ТК РФ.
            </Empty>
          ) : (
            <TableCard label="Производственный календарь">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={TABLE_HEAD} scope="col">День</th>
                    <th style={TABLE_HEAD} scope="col">Вид</th>
                    <th style={TABLE_HEAD} scope="col">Примечание</th>
                    <th style={TABLE_HEAD} scope="col">
                      <span style={VISUALLY_HIDDEN_INLINE}>Действие</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {calendar.map((entry) => (
                    <tr key={entry.day.toISOString()}>
                      <td style={TABLE_CELL}>{formatDay(entry.day)}</td>
                      <td style={TABLE_CELL}>{entry.workday ? 'рабочий' : 'нерабочий'}</td>
                      <td style={TABLE_CELL}>{entry.note ?? '—'}</td>
                      <td style={TABLE_CELL}>
                        <Form action={dropCalendarDay} inline>
                          <input type="hidden" name="day" value={entry.day.toISOString().slice(0, 10)} />
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
            Праздники ст. 112 ТК РФ учтены сами. Сюда вносятся переносы выходных по постановлению
            Правительства и рабочие субботы — раз в год, когда постановление выходит. Без них срок
            согласования этапа разойдётся с производственным календарём.
          </Text>

          <Disclosure title="Добавить день">
            <Form action={saveCalendar}>
              <FormRow>
                <Field label="День" name="day" scope="calendar" type="date" required />
                <Select label="Вид дня" name="workday" scope="calendar" defaultValue="no">
                  <option value="no">нерабочий</option>
                  <option value="yes">рабочий</option>
                </Select>
                <Field
                  label="Примечание"
                  name="note"
                  scope="calendar"
                  placeholder="Перенос выходного с 2 января"
                />
              </FormRow>
              <FormActions>
                <Button tone="quiet">Сохранить</Button>
              </FormActions>
              <Text muted size={13} style={{ marginTop: 12 }}>
                День, уже внесённый в календарь, перезаписывается.
              </Text>
            </Form>
          </Disclosure>
        </>
      ) : null}
    </Shell>
  );
}
