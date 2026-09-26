import Shell from '../../components/cabinet/Shell';
import { ButtonLink, Card, Heading, Mono, Text } from '../../components/cabinet/ui';

/**
 * Раздел не найден. Тот же ответ отдаётся, когда раздел существует, но
 * недоступен этой роли: различать «нет» и «не для вас» значило бы
 * подсказывать перебором, какие проекты есть у практики.
 */
export default function CabinetNotFound() {
  return (
    <Shell actor={null}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Mono>Раздел не найден</Mono>
        <Heading level={1} style={{ margin: '12px 0 16px' }}>
          Такой страницы нет
        </Heading>
        <Card>
          <Text style={{ marginBottom: 16 }}>
            Адрес мог измениться, а проект — быть закрыт или передан другому менеджеру. Откройте
            список работ: там видно всё, что вам доступно.
          </Text>
          {/* Два выхода — две кнопки в ряд: строка ссылок через точку
              давала цели нажатия в двадцать четыре пикселя (решение Р-253). */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <ButtonLink href="/cabinet/projects" tone="primary">
              К моим работам
            </ButtonLink>
            <ButtonLink href="/cabinet">Войти заново</ButtonLink>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
