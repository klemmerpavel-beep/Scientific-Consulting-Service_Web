import { redirect } from 'next/navigation';

import ActionError from '../../../../components/cabinet/ActionError';
import CardSlider from '../../../../components/cabinet/CardSlider';
import RecommendationMarks, { RecommendationCard } from '../../../../components/cabinet/RecommendationMarks';
import Shell from '../../../../components/cabinet/Shell';
import { ButtonLink, Card, Heading, ScreenHead, Text, formatDate, plural } from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { CONFIDENCE_LABEL, type CalendarRow, type WindowState } from '../../../../lib/cabinet/analytics/calendar';
import { MIN_TRANSITIONS, SILENCE_DAYS } from '../../../../lib/cabinet/analytics/advice';
import { formatAmount } from '../../../../lib/cabinet/money';
import { RECOMMENDATIONS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { calendarKey, recommendationsNow } from '../../../../lib/cabinet/recommendations';
import { requireActor } from '../../../../lib/cabinet/session';
import { markRecommendationAction } from '../../actions';

export const dynamic = 'force-dynamic';

/** Сколько клиентов показывается в «Возврате клиентов». */
const RETURN_LIMIT = 10;

/** Метка карточки календаря — по состоянию окна (Р-491). */
const WINDOW_KIND: Record<WindowState, string> = {
  main: 'Главное окно идёт',
  open: 'Окно открыто',
  soon: 'Окно скоро',
  later: 'Окно впереди',
};

/** Форма поручения с готовым текстом. */
const assignHref = (text: string) =>
  `/cabinet/manage/assignments?${new URLSearchParams({ text }).toString()}#new`;

/**
 * Заголовок блока: название и сколько рекомендаций ждёт решения из
 * скольких (Р-491).
 */
function BlockHead({ title, open, total }: { title: string; open: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
      <Heading level={2} size={3}>
        {title}
      </Heading>
      {total === 0 ? null : (
        <Text muted size={13}>
          {open === 0 ? `все ${total} отмечены` : `ждут решения ${open} из ${total}`}
        </Text>
      )}
    </div>
  );
}

/**
 * «Рекомендации» руководителя (требование РК-17, решение Р-350): три
 * блока — календарь продвижения (РК-16), цена и пакеты, возврат клиентов.
 * Описательные правила по истории практики, не прогноз; каждое называет,
 * на чём основано. Блок — отдельная плашка, рекомендация — карточка в
 * ленте со слайдером; её принимают, отклоняют, откладывают или поручают
 * (решение Р-491). Отмеченное уходит из числа у пункта меню.
 */
export default async function RecommendationsScreen({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor(RECOMMENDATIONS_HREF);
  if (!can(actor, 'ANALYTICS_VIEW')) redirect(homeFor(actor));
  const flags = await searchParams;
  const { calendar, price, returns, marks, unmarked } = await recommendationsNow(actor);
  // Неотмеченные — первыми в ленте: отмеченные остаются видны с отметкой.
  const unmarkedFirst = <T extends { key: string }>(rows: readonly T[]) =>
    [...rows].sort((a, b) => Number(marks.has(a.key)) - Number(marks.has(b.key)));
  const shownReturns = unmarkedFirst(returns).slice(0, RETURN_LIMIT);
  // «Сейчас» календаря — неотмеченные окна (до трёх); за ними — отмеченные
  // окна, которые ещё идут: принятое видно, отметку можно снять.
  const calendarItems: CalendarRow[] = [
    ...calendar.now,
    ...calendar.rows.filter(
      (row) => row.state !== null && row.state !== 'later' && marks.has(calendarKey(row) ?? ''),
    ),
  ];

  return (
    <Shell actor={actor} current={RECOMMENDATIONS_HREF}>
      <ScreenHead
        title="Рекомендации"
        note={`Описательные правила по истории практики, не прогноз. Ждут решения: ${unmarked}. Принятое, отклонённое, отложенное и сделанное уходит из числа у пункта меню.`}
      />
      <ActionError id={flags.error} />

      {/* Три блока — три отдельные плашки; рекомендации блока — карточками
          в ленте со слайдером: принять, отклонить, отложить, поручить
          (замечание владельца 08.10.2026, решение Р-491). */}
      <Card style={{ marginBottom: 20 }} id="calendar">
        <BlockHead
          title="Календарь продвижения"
          open={calendarItems.filter((row) => !marks.has(calendarKey(row) ?? '')).length}
          total={calendarItems.length}
        />
        <Text muted size={13} style={{ marginBottom: 14 }}>
          Окно — шесть недель до расчётной даты заказа: середина месяца сдачи минус медиана
          выполнения вида.
        </Text>
        {calendarItems.length === 0 ? (
          <Text muted>Открытых окон продвижения сейчас нет.</Text>
        ) : (
          <CardSlider label="Рекомендации календаря продвижения">
            {calendarItems.map((row) => {
              const key = calendarKey(row);
              const mark = marks.get(key ?? '');
              return (
                <RecommendationCard
                  key={row.typeCode}
                  kind={WINDOW_KIND[row.state ?? 'later']}
                  title={
                    row.state === 'main'
                      ? `Запустить продвижение «${row.typeName}»: заказ около ${formatDate(row.orderOn)}`
                      : row.state === 'open'
                        ? `Подготовить продвижение «${row.typeName}»: главное окно с ${formatDate(row.mainStart)}`
                        : `Окно «${row.typeName}» откроется ${formatDate(row.windowStart)}`
                  }
                  details={`окно ${formatDate(row.windowStart)} — ${formatDate(row.orderOn)}, главное с ${formatDate(row.mainStart)} · уверенность — ${CONFIDENCE_LABEL[row.confidence]}`}
                  marked={mark !== undefined}
                >
                  <RecommendationMarks
                    markKey={key}
                    mark={mark}
                    back="recommendations"
                    action={markRecommendationAction}
                    assignHref={assignHref(
                      `Запустить продвижение «${row.typeName}»: главное окно с ${formatDate(row.mainStart) ?? ''}, заказ около ${formatDate(row.orderOn) ?? ''}`,
                    )}
                  />
                </RecommendationCard>
              );
            })}
          </CardSlider>
        )}
        <div style={{ marginTop: 14 }}>
          <ButtonLink href="/cabinet/manage/recommendations/calendar" tone="quiet">
            Весь календарь
          </ButtonLink>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }} id="price">
        <BlockHead
          title="Цена и пакеты"
          open={price.filter((row) => !marks.has(row.key)).length}
          total={price.length}
        />
        <Text muted size={13} style={{ marginBottom: 14 }}>
          На чём основано: разброс чека вида выше 40 % при трёх и более заказах — одна и та же
          работа продаётся по разной цене. Правило предлагает зафиксировать цену по собственной
          медиане до начала окна продвижения вида.
        </Text>
        {price.length === 0 ? (
          <Text muted>Цена по видам работ держится: разброс нигде не выше 40 %.</Text>
        ) : (
          <CardSlider label="Рекомендации по цене и пакетам">
            {unmarkedFirst(price).map((row) => (
              <RecommendationCard
                key={row.key}
                kind="Цена вида работ"
                title={`Зафиксировать цену «${row.typeName}» на уровне медианы ${formatAmount(row.medianCheck)}${row.before === null ? '' : ` до ${formatDate(row.before)} — начала окна продвижения`}`}
                details={`разброс ${Math.round(row.variation * 100)} % · ${row.orders} ${plural(row.orders, 'заказ', 'заказа', 'заказов')} · средний чек ${formatAmount(row.averageCheck)}${row.min === null || row.max === null ? '' : ` · от ${formatAmount(row.min)} до ${formatAmount(row.max)}`}`}
                marked={marks.has(row.key)}
              >
                <RecommendationMarks
                  markKey={row.key}
                  mark={marks.get(row.key)}
                  back="recommendations"
                  action={markRecommendationAction}
                  assignHref={assignHref(
                    `Подготовить базовую цену «${row.typeName}» на уровне медианы ${formatAmount(row.medianCheck)}${row.before === null ? '' : ` до ${formatDate(row.before) ?? ''}`}`,
                  )}
                />
              </RecommendationCard>
            ))}
          </CardSlider>
        )}
      </Card>

      <Card id="returns">
        <BlockHead
          title="Возврат клиентов"
          open={returns.filter((row) => !marks.has(row.key)).length}
          total={returns.length}
        />
        <Text muted size={13} style={{ marginBottom: 14 }}>
          {`На чём основано: у клиента нет действующих работ, последний заказ старше ${SILENCE_DAYS} дней. «Следующая работа» — самый частый переход от вида его последней работы к следующему заказу у клиентов практики; при меньше чем ${MIN_TRANSITIONS} переходах подсказки нет. Писать с предложением можно только тем, кто дал согласие на рассылку в последней заявке.`}
        </Text>
        {shownReturns.length === 0 ? (
          <Text muted>Молчащих дольше полугода клиентов нет.</Text>
        ) : (
          <CardSlider label="Рекомендации по возврату клиентов">
            {shownReturns.map((row) => (
              <RecommendationCard
                key={row.key}
                kind={row.consent ? 'Возврат клиента · согласие есть' : 'Возврат клиента · согласия нет'}
                title={
                  row.next === null
                    ? `Вернуться к клиенту ${row.clientName}`
                    : `Предложить клиенту ${row.clientName} «${row.next.toName}»`
                }
                details={[
                  `последний заказ ${formatDate(row.lastOrder)} — «${row.lastTypeName}»`,
                  `${row.works} ${plural(row.works, 'работа', 'работы', 'работ')}`,
                  row.next === null
                    ? 'следующая работа: мало переходов'
                    : `следующая работа: «${row.next.toName}» (${row.next.count} из ${row.next.total})`,
                  row.consent ? 'согласие на рассылку есть' : 'нет согласия на рассылку',
                ].join(' · ')}
                marked={marks.has(row.key)}
              >
                <RecommendationMarks
                  markKey={row.key}
                  mark={marks.get(row.key)}
                  back="recommendations"
                  action={markRecommendationAction}
                  assignHref={assignHref(
                    `Связаться с клиентом «${row.clientName}»${row.next === null ? '' : ` и предложить «${row.next.toName}»`}${row.consent ? '' : ' — согласия на рассылку нет: только ответ на его обращение'}`,
                  )}
                />
              </RecommendationCard>
            ))}
          </CardSlider>
        )}
        {returns.length <= RETURN_LIMIT ? null : (
          <Text muted size={13} style={{ marginTop: 12 }}>
            И ещё {returns.length - RETURN_LIMIT} {plural(returns.length - RETURN_LIMIT, 'клиент', 'клиента', 'клиентов')}: лента
            сдвигается по мере отметок.
          </Text>
        )}
      </Card>
    </Shell>
  );
}
