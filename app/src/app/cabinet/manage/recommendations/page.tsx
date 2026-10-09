import { redirect } from 'next/navigation';

import ActionError from '../../../../components/cabinet/ActionError';
import CardSlider from '../../../../components/cabinet/CardSlider';
import RecommendationMarks, {
  CalendarRecommendationCard,
  RecommendationCard,
  assignHref,
} from '../../../../components/cabinet/RecommendationMarks';
import Shell from '../../../../components/cabinet/Shell';
import { ButtonLink, Card, Heading, ScreenHead, Text, formatDate, plural } from '../../../../components/cabinet/ui';
import { can } from '../../../../lib/cabinet/access';
import type { CalendarRow } from '../../../../lib/cabinet/analytics/calendar';
import { MIN_TRANSITIONS, SILENCE_DAYS } from '../../../../lib/cabinet/analytics/advice';
import { formatAmount } from '../../../../lib/cabinet/money';
import { RECOMMENDATIONS_HREF, homeFor } from '../../../../lib/cabinet/nav';
import { laneOrder, limitedLane } from '../../../../lib/cabinet/recommendation-order';
import { calendarKey, recommendationsNow } from '../../../../lib/cabinet/recommendations';
import { requireActor } from '../../../../lib/cabinet/session';
import { markRecommendationAction } from '../../actions';

export const dynamic = 'force-dynamic';

/** Сколько клиентов показывается в «Возврате клиентов». */
const RETURN_LIMIT = 10;

/**
 * Заголовок блока: название и сколько рекомендаций ждёт решения (Р-491).
 * Сумма по трём блокам — то же число, что у пункта меню и в подписи
 * экрана. Прежде стояло «N из M», и M у календаря смешивал три
 * показанных окна с отмеченными, не считая окон сверх трёх (Р-499).
 */
function BlockHead({ title, open, any }: { title: string; open: number; any: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
      <Heading level={2} size={3}>
        {title}
      </Heading>
      {!any ? null : (
        <Text muted size={13}>
          {open === 0 ? 'всё отмечено' : `ждут решения: ${open}`}
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
  // В ленте — сначала ждущие решения, за ними принятые, в конце закрытые
  // отметкой. Принятое ждёт поручения и «Сделано» и за предел ленты не
  // уходит (решение Р-499).
  const markOf = (row: { key: string }) => marks.get(row.key);
  const returnsLane = limitedLane(returns, markOf, RETURN_LIMIT);
  const priceLane = laneOrder(price, markOf);
  // «Сейчас» календаря — неотмеченные окна (до трёх); за ними — отмеченные
  // окна, которые ещё идут: принятое видно, отметку можно снять.
  const windowMark = (row: CalendarRow) => marks.get(calendarKey(row) ?? '');
  const running = calendar.rows.filter((row) => row.state !== null && row.state !== 'later');
  const calendarItems: CalendarRow[] = [
    ...calendar.now,
    ...laneOrder(running.filter((row) => windowMark(row) !== undefined), windowMark),
  ];
  // Открытые окна сверх трёх ближайших: их нет ни в ленте, ни в числе у
  // пункта меню, отмечаются они в таблице видов календаря (Р-499).
  const moreWindows = running.filter((row) => windowMark(row) === undefined).length - calendar.now.length;

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
        <BlockHead title="Календарь продвижения" open={calendar.now.length} any={calendarItems.length > 0} />
        <Text muted size={13} style={{ marginBottom: 14 }}>
          Окно — шесть недель до расчётной даты заказа: середина месяца сдачи минус медиана
          выполнения вида.
        </Text>
        {calendarItems.length === 0 ? (
          <Text muted>Открытых окон продвижения сейчас нет.</Text>
        ) : (
          <CardSlider label="Рекомендации календаря продвижения">
            {calendarItems.map((row) => (
              <CalendarRecommendationCard
                key={row.typeCode}
                row={row}
                mark={marks.get(calendarKey(row) ?? '')}
                back="recommendations"
                action={markRecommendationAction}
              />
            ))}
          </CardSlider>
        )}
        {moreWindows <= 0 ? null : (
          <Text muted size={13} style={{ marginTop: 12 }}>
            {`Показаны три ближайших окна. Ещё ${moreWindows} ${plural(moreWindows, 'окно открыто', 'окна открыты', 'окон открыты')} — в календаре, в таблице видов.`}
          </Text>
        )}
        <div style={{ marginTop: 14 }}>
          <ButtonLink href="/cabinet/manage/recommendations/calendar" tone="quiet">
            Весь календарь
          </ButtonLink>
        </div>
      </Card>

      <Card style={{ marginBottom: 20 }} id="price">
        <BlockHead title="Цена и пакеты" open={price.filter((row) => !marks.has(row.key)).length} any={price.length > 0} />
        <Text muted size={13} style={{ marginBottom: 14 }}>
          На чём основано: разброс чека вида выше 40 % при трёх и более заказах — одна и та же
          работа продаётся по разной цене. Правило предлагает зафиксировать цену по собственной
          медиане до начала окна продвижения вида.
        </Text>
        {price.length === 0 ? (
          <Text muted>Цена по видам работ держится: разброс нигде не выше 40 %.</Text>
        ) : (
          <CardSlider label="Рекомендации по цене и пакетам">
            {priceLane.map((row) => (
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
        <BlockHead title="Возврат клиентов" open={returns.filter((row) => !marks.has(row.key)).length} any={returns.length > 0} />
        <Text muted size={13} style={{ marginBottom: 14 }}>
          {`На чём основано: у клиента нет действующих работ, последний заказ старше ${SILENCE_DAYS} дней. «Следующая работа» — самый частый переход от вида его последней работы к следующему заказу у клиентов практики; при меньше чем ${MIN_TRANSITIONS} переходах подсказки нет. Писать с предложением можно только тем, кто дал согласие на рассылку в последней заявке.`}
        </Text>
        {returnsLane.shown.length === 0 ? (
          <Text muted>Молчащих дольше полугода клиентов нет.</Text>
        ) : (
          <CardSlider label="Рекомендации по возврату клиентов">
            {returnsLane.shown.map((row) => (
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
        {/* Считаются только ждущие решения: закрытые отметкой в ленту уже
            не вернутся, и обещать их показать нельзя (Р-499). */}
        {returnsLane.hiddenOpen === 0 ? null : (
          <Text muted size={13} style={{ marginTop: 12 }}>
            {`И ещё ${returnsLane.hiddenOpen} ${plural(returnsLane.hiddenOpen, 'клиент ждёт', 'клиента ждут', 'клиентов ждут')} решения: они встанут в ленту по мере отметок.`}
          </Text>
        )}
      </Card>
    </Shell>
  );
}
