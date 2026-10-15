import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import {
  Button,
  Card,
  Checkbox,
  Form,
  FormActions,
  Heading,
  Narrow,
  Outcome,
  ScreenHead,
  Select,
  Text,
} from '../../../../components/cabinet/ui';
import { SANS } from '../../../../components/cabinet/tokens';
import { can } from '../../../../lib/cabinet/access';
import { flashText } from '../../../../lib/cabinet/flash';
import { homeFor } from '../../../../lib/cabinet/nav';
import { requireActor } from '../../../../lib/cabinet/session';
import { SUMMARY_BANDS, SUMMARY_PLATES, isShown } from '../../../../lib/cabinet/summary-layout';
import { summaryLayoutOf } from '../../../../lib/cabinet/summary-settings';
import { resetSummaryLayout, saveSummaryLayoutForm } from '../../actions';

export const dynamic = 'force-dynamic';

/**
 * «Настройка сводки» (план по образцу, К-5, решение Р-595): какие плашки
 * «Сводки» показывать и в каком порядке, показывать ли «Разбор практики» и
 * «Пульс практики». Одна форма без клиентского кода: место выбирается
 * списком, показ — флажком (довод Р-572). Раскладка своя у каждого
 * руководителя и хранится у него в записи.
 */
export default async function SummaryLayoutScreen({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await requireActor('/cabinet/manage/layout');
  if (!can(actor, 'ANALYTICS_VIEW')) redirect(homeFor(actor));

  const [params, layout] = await Promise.all([searchParams, summaryLayoutOf(actor)]);
  const failure = await flashText(params.error);
  const label = new Map<string, string>(SUMMARY_PLATES.map((plate) => [plate.key, plate.label]));
  const places = SUMMARY_PLATES.map((_, index) => index + 1);

  return (
    // В меню подсвечена «Сводка»: экран — её часть, а не раздел «Управления».
    <Shell actor={actor} current="/cabinet/manage">
      <Narrow width={880}>
        <ScreenHead
          backHref="/cabinet/manage"
          backLabel="Сводка"
          title="Настройка сводки"
          note="Какие плашки показывать и в каком порядке"
        />

        {failure === undefined ? null : <Outcome tone="error">{failure}</Outcome>}
        {params.saved === undefined ? null : <Outcome>Раскладка сохранена.</Outcome>}

        <Form action={saveSummaryLayoutForm}>
          <Card>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Плашки
            </Heading>
            <Text muted size={14} style={{ marginBottom: 12 }}>
              Плашки стоят сеткой в два столбца в порядке мест. Плашка, поставленная на занятое место,
              встаёт на него, остальные сдвигаются. Скрытая плашка не показывается, но её место сохраняется.
            </Text>
            {/* Перечень, а не таблица: на телефоне строка переносится — название
                сверху, место и флажок под ним, — и ничего не уходит за край. */}
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {layout.order.map((key, index) => (
                <li
                  key={key}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '8px 16px',
                    padding: '10px 0',
                    borderTop: index === 0 ? 'none' : '1px solid var(--pd-divider)',
                  }}
                >
                  <input type="hidden" name={`row:${key}`} value="1" />
                  <input type="hidden" name={`was:${key}`} value={String(index + 1)} />
                  <span style={{ flex: '1 1 220px', fontFamily: SANS, fontSize: 15, color: 'var(--pd-ink)' }}>{label.get(key)}</span>
                  <Select label={`Место плашки «${label.get(key)}»`} name={`place:${key}`} labelHidden defaultValue={String(index + 1)} minWidth={96}>
                    {places.map((place) => (
                      <option key={place} value={String(place)}>
                        {`место ${place}`}
                      </option>
                    ))}
                  </Select>
                  <Checkbox label="показывать" name={`shown:${key}`} defaultChecked={isShown(layout, key)} dense nowrap />
                </li>
              ))}
            </ol>
          </Card>

          <Card style={{ marginTop: 20 }}>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Полосы над плашками
            </Heading>
            <Text muted size={14} style={{ marginBottom: 12 }}>
              «Требует внимания» и «На этой неделе» показываются всегда: на них ведут число в ответе «Сводки»
              и группы «Разбора практики».
            </Text>
            <div style={{ display: 'grid', gap: 4 }}>
              {SUMMARY_BANDS.map((band) => (
                <div key={band.key}>
                  <input type="hidden" name={`row:${band.key}`} value="1" />
                  <Checkbox label={band.label} name={`shown:${band.key}`} defaultChecked={isShown(layout, band.key)} dense />
                </div>
              ))}
            </div>
          </Card>

          <FormActions>
            <Button>Сохранить</Button>
          </FormActions>
        </Form>

        <Form action={resetSummaryLayout} inline style={{ marginTop: 12 }}>
          <Button tone="quiet">Вернуть как было</Button>
        </Form>
      </Narrow>
    </Shell>
  );
}
