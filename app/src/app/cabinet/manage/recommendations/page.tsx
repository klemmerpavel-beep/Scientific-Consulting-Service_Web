import { redirect } from 'next/navigation';

import ActionError from '../../../../components/cabinet/ActionError';
import RecommendationMarks from '../../../../components/cabinet/RecommendationMarks';
import Shell from '../../../../components/cabinet/Shell';
import { ButtonLink, Card, Heading, ScreenHead, Text, formatDate, plural } from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import { CONFIDENCE_LABEL } from '../../../../lib/cabinet/analytics/calendar';
import { MIN_TRANSITIONS, SILENCE_DAYS } from '../../../../lib/cabinet/analytics/advice';
import { formatAmount } from '../../../../lib/cabinet/money';
import { RECOMMENDATIONS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { calendarKey, recommendationsNow } from '../../../../lib/cabinet/recommendations';
import { requireActor } from '../../../../lib/cabinet/session';
import { markRecommendationAction } from '../../actions';

export const dynamic = 'force-dynamic';

/** Сколько клиентов показывается в «Возврате клиентов». */
const RETURN_LIMIT = 10;

/**
 * «Рекомендации» руководителя (требование РК-17, решение Р-350): три
 * блока — календарь продвижения (РК-16), цена и пакеты, возврат клиентов.
 * Описательные правила по истории практики, не прогноз; каждое называет,
 * на чём основано. Отмеченное «сделано» или «отложено» уходит из числа у
 * пункта меню.
 */
export default async function RecommendationsScreen({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor(RECOMMENDATIONS_HREF);
  if (!can(actor, 'ANALYTICS_VIEW')) redirect(homeFor(actor));
  const flags = await searchParams;
  const { calendar, price, returns, marks, unmarked } = await recommendationsNow(actor);
  // Неотмеченные — сверху: отмеченные остаются видны с отметкой.
  const shownReturns = [...returns].sort((a, b) => Number(marks.has(a.key)) - Number(marks.has(b.key))).slice(0, RETURN_LIMIT);

  return (
    <Shell actor={actor} current={RECOMMENDATIONS_HREF}>
      <ScreenHead
        title="Рекомендации"
        note={`Описательные правила по истории практики, не прогноз. Не отмечено: ${unmarked}. Отмеченное «сделано» или «отложено» уходит из числа у пункта меню.`}
      />
      <ActionError id={flags.error} />

      <Card style={{ marginBottom: 20 }}>
        <Heading level={2} size={3} style={{ marginBottom: 6 }}>
          Календарь продвижения
        </Heading>
        <Text muted size={13} style={{ marginBottom: 12 }}>
          Окно — шесть недель до расчётной даты заказа: середина месяца сдачи минус медиана
          выполнения вида.
        </Text>
        {calendar.now.length === 0 ? (
          <Text muted>Открытых окон продвижения сейчас нет.</Text>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
            {calendar.now.map((row) => (
              <li key={row.typeCode} style={{ display: 'grid', gap: 6 }}>
                <Text size={15}>
                  {row.state === 'main'
                    ? `Запустить продвижение «${row.typeName}»: главное окно идёт, заказ около ${formatDate(row.orderOn)}`
                    : row.state === 'open'
                      ? `Подготовить продвижение «${row.typeName}»: главное окно с ${formatDate(row.mainStart)}`
                      : `Окно «${row.typeName}» откроется ${formatDate(row.windowStart)}`}
                </Text>
                <Text muted size={13}>{`уверенность — ${CONFIDENCE_LABEL[row.confidence]}`}</Text>
                <RecommendationMarks
                  markKey={calendarKey(row)}
                  mark={marks.get(calendarKey(row) ?? '')}
                  back="recommendations"
                  action={markRecommendationAction}
                />
                <a
                  className="cab-mark"
                  href={`/cabinet/manage/assignments?${new URLSearchParams({
                    text: `Запустить продвижение «${row.typeName}»: главное окно с ${formatDate(row.mainStart) ?? ''}, заказ около ${formatDate(row.orderOn) ?? ''}`,
                  }).toString()}#new`}
                >
                  Поручить
                </a>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 14 }}>
          <ButtonLink href="/cabinet/manage/recommendations/calendar" tone="quiet">
            Весь календарь
          </ButtonLink>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }} id="price">
        <Heading level={2} size={3} style={{ marginBottom: 6 }}>
          Цена и пакеты
        </Heading>
        <Text muted size={13} style={{ marginBottom: 12 }}>
          На чём основано: разброс чека вида выше 40 % при трёх и более заказах — одна и та же
          работа продаётся по разной цене. Правило предлагает зафиксировать цену по собственной
          медиане до начала окна продвижения вида.
        </Text>
        {price.length === 0 ? (
          <Text muted>Цена по видам работ держится: разброс нигде не выше 40 %.</Text>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
            {price.map((row) => (
              <li key={row.key} style={{ display: 'grid', gap: 6 }}>
                <Text size={15}>
                  {`Зафиксировать цену «${row.typeName}» на уровне медианы ${formatAmount(row.medianCheck)}${row.before === null ? '' : ` до ${formatDate(row.before)} — начала окна продвижения`}`}
                </Text>
                <Text muted size={13}>
                  {`разброс ${Math.round(row.variation * 100)} % · ${row.orders} ${plural(row.orders, 'заказ', 'заказа', 'заказов')} · средний чек ${formatAmount(row.averageCheck)}${row.min === null || row.max === null ? '' : ` · от ${formatAmount(row.min)} до ${formatAmount(row.max)}`}`}
                </Text>
                <RecommendationMarks markKey={row.key} mark={marks.get(row.key)} back="recommendations" action={markRecommendationAction} />
                <a
                  className="cab-mark"
                  href={`/cabinet/manage/assignments?${new URLSearchParams({
                    text: `Подготовить базовую цену «${row.typeName}» на уровне медианы ${formatAmount(row.medianCheck)}${row.before === null ? '' : ` до ${formatDate(row.before) ?? ''}`}`,
                  }).toString()}#new`}
                >
                  Поручить
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card id="returns">
        <Heading level={2} size={3} style={{ marginBottom: 6 }}>
          Возврат клиентов
        </Heading>
        <Text muted size={13} style={{ marginBottom: 12 }}>
          {`На чём основано: у клиента нет действующих работ, последний заказ старше ${SILENCE_DAYS} дней. «Следующая работа» — самый частый переход от вида его последней работы к следующему заказу у клиентов практики; при меньше чем ${MIN_TRANSITIONS} переходах подсказки нет. Писать с предложением можно только тем, кто дал согласие на рассылку в последней заявке.`}
        </Text>
        {shownReturns.length === 0 ? (
          <Text muted>Молчащих дольше полугода клиентов нет.</Text>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
            {shownReturns.map((row) => (
              <li key={row.key} style={{ display: 'grid', gap: 6 }}>
                <Text size={15}>{row.clientName}</Text>
                <Text muted size={13}>
                  {[
                    `последний заказ ${formatDate(row.lastOrder)} — «${row.lastTypeName}»`,
                    `${row.works} ${plural(row.works, 'работа', 'работы', 'работ')}`,
                    row.next === null
                      ? 'следующая работа: мало переходов'
                      : `следующая работа: «${row.next.toName}» (${row.next.count} из ${row.next.total})`,
                    row.consent ? 'согласие на рассылку есть' : 'нет согласия на рассылку',
                  ].join(' · ')}
                </Text>
                <RecommendationMarks markKey={row.key} mark={marks.get(row.key)} back="recommendations" action={markRecommendationAction} />
                <a
                  className="cab-mark"
                  href={`/cabinet/manage/assignments?${new URLSearchParams({
                    text: `Связаться с клиентом «${row.clientName}»${row.next === null ? '' : ` и предложить «${row.next.toName}»`}${row.consent ? '' : ' — согласия на рассылку нет: только ответ на его обращение'}`,
                  }).toString()}#new`}
                >
                  Поручить
                </a>
              </li>
            ))}
          </ul>
        )}
        {returns.length <= RETURN_LIMIT ? null : (
          <Text muted size={13} style={{ marginTop: 12 }}>
            И ещё {returns.length - RETURN_LIMIT} {plural(returns.length - RETURN_LIMIT, 'клиент', 'клиента', 'клиентов')}: список
            сдвигается по мере отметок.
          </Text>
        )}
      </Card>
    </Shell>
  );
}
