import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { CABINET_CSS } from '../../components/cabinet/tokens';
import { Heading, Mono, Notice, Text } from '../../components/cabinet/ui';
import { cabinetReadiness } from '../../lib/cabinet/readiness';

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
  // Раздел уезжает на боевой сервер вместе с сайтом, и без своих настроек
  // он падал бы пятисотой ошибкой на живом домене. Одна проверка в каркасе
  // заменяет её честной страницей (решение Р-153).
  const readiness = cabinetReadiness();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CABINET_CSS }} />
      {readiness.ready ? children : <NotReady missing={readiness.missing} />}
    </>
  );
}

/**
 * Страница «раздел готовится».
 *
 * Посетителю — что делать дальше; имена настроек показываются только на
 * стенде разработки: на боевом сайте это подсказка о внутреннем устройстве
 * и постороннему не адресована.
 */
function NotReady({ missing }: { missing: readonly string[] }) {
  const local = process.env.NODE_ENV !== 'production';
  return (
    <main
      id="main"
      className="cab-pad"
      style={{
        boxSizing: 'border-box',
        maxWidth: 1220,
        margin: '0 auto',
        padding: 'clamp(32px,4vw,56px) 30px clamp(72px,7vw,112px)',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Mono>Личный кабинет</Mono>
        <Heading level={1} style={{ margin: '12px 0 16px' }}>
          Раздел готовится
        </Heading>
        <Text style={{ marginBottom: 16 }}>
          Личный кабинет ещё не открыт. Ход работы по вашему сопровождению сообщит менеджер —
          напишите на <a href="mailto:info@prodisser.ru">info@prodisser.ru</a>.
        </Text>
        {local ? (
          <Notice tone="quiet">
            Не заданы настройки: {missing.join(', ')}. Порядок — docs/DEPLOY.md.
          </Notice>
        ) : null}
      </div>
    </main>
  );
}
