import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CABINET_CSS } from '../../components/cabinet/tokens';

/**
 * Разметка закрытого раздела. Общие правила оформления подключаются здесь
 * один раз: в каждом экране свой блок стилей означал бы десятки повторов
 * одного и того же и расхождение при первой же правке.
 *
 * Раздел закрыт от индексирования целиком: за входом лежат персональные
 * данные, а сама форма входа поисковику бесполезна.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CABINET_CSS }} />
      {children}
    </>
  );
}
