import Shell from '../../components/cabinet/Shell';
import { Card, Heading, Mono, Text } from '../../components/cabinet/ui';

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
          <Text>
            <a href="/cabinet/projects">К моим работам</a> · <a href="/cabinet">Войти заново</a>
          </Text>
        </Card>
      </div>
    </Shell>
  );
}
