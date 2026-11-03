import type { CSSProperties } from 'react';

import { CURATOR_PROFILE_NOTE, curatorProfileRows, type CuratorPublicProfile } from '../../lib/cabinet/access';
import { Disclosure, Text } from './ui';

/**
 * Свёртка «Профиль куратора» (П-1, решение Р-764): обезличенный профиль —
 * степень и звание, специальность, стаж, публикации по категориям журналов
 * «за пять лет, сверено {дата}», число завершённых работ ProDisser с
 * куратором. Стоит внутри «О работе» у клиента и в «Так вас видит клиент»
 * у куратора (Р-330) — одна разметка на оба места. Сомкнута при показе;
 * своим блоком экрана не считается (Р-183): лежит внутри карточки или
 * свёртки.
 *
 * Строки собирает `curatorProfileRows` из полей, которые пропускает
 * `withoutStaffNames`: имени, должности, вуза, контактов, ставки и средней
 * оценки в ней нет и взять их неоткуда.
 */
export function CuratorProfileFold({
  profile,
  done,
  style,
}: {
  profile: CuratorPublicProfile | null;
  /** Завершённые работы с куратором; `null` — число смотрящему не отдаётся. */
  done: number | null;
  style?: CSSProperties;
}) {
  const rows = curatorProfileRows(profile, done);
  if (rows.length === 0) return null;
  return (
    <Disclosure title="Профиль куратора" style={style}>
      <Text muted size={13} style={{ marginBottom: 12 }}>
        {CURATOR_PROFILE_NOTE}
      </Text>
      <dl style={{ margin: 0, display: 'grid', gap: 10 }}>
        {/* Подпись и значение — строкой с переносом, как «О работе» (Р-694). */}
        {rows.map((row) => (
          <div key={row.term} style={{ display: 'flex', flexWrap: 'wrap', columnGap: 14, rowGap: 2 }}>
            <dt style={{ margin: 0, flex: '0 0 170px', minWidth: 0 }}>
              <Text muted size={13}>
                {row.term}
              </Text>
            </dt>
            <dd style={{ margin: 0, flex: '1 1 220px', minWidth: 0 }}>
              <Text size={14}>{row.value}</Text>
              {row.note === undefined ? null : (
                <Text muted size={13}>
                  {row.note}
                </Text>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Disclosure>
  );
}
