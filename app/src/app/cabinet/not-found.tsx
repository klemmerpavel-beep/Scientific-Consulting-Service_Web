import Shell from '../../components/cabinet/Shell';
import { ButtonLink, Card, Heading, Mono, Text } from '../../components/cabinet/ui';
import { homeFor, menuLabel } from '../../lib/cabinet/nav';
import { currentActor } from '../../lib/cabinet/session';

const WORKS_HREF = '/cabinet/projects';

/**
 * Раздел не найден. Тот же ответ отдаётся, когда раздел существует, но
 * недоступен этой роли: различать «нет» и «не для вас» значило бы
 * подсказывать перебором, какие проекты есть у практики.
 *
 * Вошедший остаётся в кабинете: меню на месте, а кнопки названы пунктами
 * меню его роли (решение Р-896). Прежде экран рисовался без меню и звал
 * «к моим работам» и руководителя, у которого такого пункта нет, а
 * менеджера и руководителя не возвращал на их начальный экран.
 */
export default async function CabinetNotFound() {
  const actor = await currentActor();
  const home = actor === null ? null : homeFor(actor);
  // Второй выход — начальный экран роли, когда он не перечень работ;
  // иначе и без сеанса — вход.
  const second =
    actor !== null && home !== null && home !== WORKS_HREF
      ? { href: home, label: menuLabel(actor, home) ?? 'На начальный экран' }
      : { href: '/cabinet', label: 'Войти заново' };

  return (
    <Shell actor={actor}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Mono>Раздел не найден</Mono>
        <Heading level={1} style={{ margin: '12px 0 16px' }}>
          Такой страницы нет
        </Heading>
        <Card>
          <Text style={{ marginBottom: 16 }}>
            Адрес мог измениться, а работа — быть закрыта или передана другому менеджеру или куратору. Откройте
            список работ: там видно всё, что вам доступно.
          </Text>
          {/* Два выхода — две кнопки в ряд: строка ссылок через точку
              давала цели нажатия в двадцать четыре пикселя (решение Р-253). */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <ButtonLink href={WORKS_HREF} tone="primary">
              {actor === null ? 'К моим работам' : (menuLabel(actor, WORKS_HREF) ?? 'Работы')}
            </ButtonLink>
            <ButtonLink href={second.href}>{second.label}</ButtonLink>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
