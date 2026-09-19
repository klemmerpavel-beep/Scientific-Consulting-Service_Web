import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { Card, Empty, Heading, Mono, Text } from '../../../../components/cabinet/ui';
import { can, type Action } from '../../../../lib/cabinet/access';
import { currentActor } from '../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Служебный контур практики.
 *
 * Разделы отсюда в первый ряд навигации не выносятся решением Р-140: они
 * нужны изредка и вытеснили бы работу. Но и оставлять их доступными только
 * по набранному вручную адресу неправильно — так о них знает лишь тот, кто
 * писал код. Один пункт меню и страница со ссылками: место в навигации
 * занято одной строкой, а попасть можно куда угодно.
 *
 * Роль решает не этот перечень, а матрица прав: каждому видно ровно то, на
 * что он имеет право, и чужая ссылка не показывается вовсе.
 */
const TOOLS: readonly { href: string; title: string; note: string; action: Action }[] = [
  {
    href: '/cabinet/manage/registry',
    title: 'Реестры',
    note: 'Клиенты и эксперты, сообщения с признаком передачи контактов',
    action: 'REGISTRY_VIEW',
  },
  {
    href: '/cabinet/manage/users',
    title: 'Учётные записи',
    note: 'Роли, доступ, договоры поручения обработки персональных данных',
    action: 'USER_MANAGE',
  },
  {
    href: '/cabinet/manage/directory',
    title: 'Справочники',
    note: 'Типы сопровождения, исторические написания, шаблоны этапов',
    action: 'DIRECTORY_EDIT',
  },
  {
    href: '/cabinet/manage/import',
    title: 'Перенос книги заказов',
    note: 'Разбор .xlsx, отчёт предпросмотра, фиксация загрузки',
    action: 'IMPORT_RUN',
  },
  {
    href: '/cabinet/manage/audit',
    title: 'Журналы',
    note: 'Кто и что изменил, кому и когда выдавались файлы',
    action: 'AUDIT_VIEW',
  },
  {
    href: '/cabinet/manage/outbox',
    title: 'Очередь уведомлений',
    note: 'Что ушло, что ждёт отправки, что не доставлено',
    action: 'AUDIT_VIEW',
  },
  {
    href: '/cabinet/manage/erasure',
    title: 'Удаление данных субъекта',
    note: 'Требования по ФЗ-152 и отчёты об исполнении',
    action: 'ERASURE_EXECUTE',
  },
];

export default async function ToolsScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const allowed = TOOLS.filter((tool) => can(actor, tool.action));
  if (allowed.length === 0) redirect('/cabinet/projects');

  return (
    <Shell actor={actor} current="/cabinet/manage/tools">
      <Mono>Управление</Mono>
      <Heading level={1} style={{ margin: '12px 0 24px' }}>
        Служебные разделы
      </Heading>

      {allowed.length === 0 ? (
        <Empty title="Разделов нет" />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
          {allowed.map((tool) => (
            <Card as="li" key={tool.href} link>
              <Heading level={2} size={3} style={{ marginBottom: 4 }}>
                <a href={tool.href}>{tool.title}</a>
              </Heading>
              <Text muted size={14}>
                {tool.note}
              </Text>
            </Card>
          ))}
        </ul>
      )}
    </Shell>
  );
}
