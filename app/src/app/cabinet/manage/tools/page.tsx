import { redirect } from 'next/navigation';

import Shell from '../../../../components/cabinet/Shell';
import { Card, Heading, ScreenHead, Text } from '../../../../components/cabinet/ui';
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
const GROUPS = [
  {
    key: 'work',
    title: 'Обращения и клиенты',
    note: 'То, с чем куратор работает изо дня в день.',
  },
  {
    key: 'setup',
    title: 'Настройка практики',
    note: 'Как устроены типы работ, планы и доступ сотрудников.',
  },
  {
    key: 'law',
    title: 'Надзор и право',
    note: 'Чем практика отчитывается: журналы, доставка, требования субъектов.',
  },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];

/**
 * Что за раздел, зачем он и когда в него заходят.
 *
 * Подпись называет не содержимое экрана, а задачу, которую им решают:
 * «Журналы: кто и что изменил» не отвечает на вопрос, зачем туда идти, а
 * «разобрать спор о том, кто и когда правил работу» — отвечает
 * (решение Р-192).
 */
const TOOLS: readonly {
  href: string;
  title: string;
  note: string;
  action: Action;
  group: GroupKey;
}[] = [
  {
    href: '/cabinet/manage/leads',
    title: 'Все заявки',
    note: 'Разобрать обращение, найти старое, выгрузить перечень за период. Отбор по состоянию, направлению и сроку.',
    action: 'REQUEST_MODERATE',
    group: 'work',
  },
  {
    href: '/cabinet/manage/registry',
    title: 'Реестры',
    note: 'Посмотреть, что практика знает о клиенте или исполнителе, и проверить сообщения с признаком передачи контактов.',
    action: 'REGISTRY_VIEW',
    group: 'work',
  },
  {
    href: '/cabinet/manage/directory',
    title: 'Справочники',
    note: 'Завести новый тип сопровождения или поправить шаблон этапов, который разворачивается при одобрении заявки.',
    action: 'DIRECTORY_EDIT',
    group: 'setup',
  },
  {
    href: '/cabinet/manage/users',
    title: 'Учётные записи',
    note: 'Открыть или закрыть доступ сотруднику, сменить роль, отметить договор поручения обработки персональных данных.',
    action: 'USER_MANAGE',
    group: 'setup',
  },
  {
    href: '/cabinet/manage/import',
    title: 'Перенос книги заказов',
    note: 'Перенести историю из таблицы учёта: разбор файла, отчёт с замечаниями по строкам, фиксация загрузки.',
    action: 'IMPORT_RUN',
    group: 'setup',
  },
  {
    href: '/cabinet/manage/audit',
    title: 'Журналы',
    note: 'Разобрать спор: кто и когда правил работу, кому и когда выдавались файлы.',
    action: 'AUDIT_VIEW',
    group: 'law',
  },
  {
    href: '/cabinet/manage/outbox',
    title: 'Очередь уведомлений',
    note: 'Проверить, дошло ли письмо: что ушло, что ждёт отправки, что не доставлено и почему.',
    action: 'AUDIT_VIEW',
    group: 'law',
  },
  {
    href: '/cabinet/manage/disk',
    title: 'Зеркало на облачном диске',
    note: 'Проверить, идёт ли выгрузка таблиц и материалов на диск: когда была последняя, что ушло, были ли ошибки.',
    action: 'AUDIT_VIEW',
    group: 'law',
  },
  {
    href: '/cabinet/manage/erasure',
    title: 'Удаление данных субъекта',
    note: 'Исполнить требование по ст. 21 152-ФЗ и выдать заявителю отчёт о том, что именно затёрто.',
    action: 'ERASURE_EXECUTE',
    group: 'law',
  },
];

export default async function ToolsScreen() {
  const actor = await currentActor();
  if (actor === null) redirect('/cabinet');

  const allowed = TOOLS.filter((tool) => can(actor, tool.action));
  if (allowed.length === 0) redirect('/cabinet/projects');

  const groups = GROUPS.map((group) => ({
    ...group,
    tools: allowed.filter((tool) => tool.group === group.key),
  })).filter((group) => group.tools.length > 0);

  // Менеджеру открыты не все разделы, и пустое место на экране читается как
  // поломка. Строка называет причину прямо: остальное ведёт руководитель
  // практики (решение Р-192).
  const partial = allowed.length < TOOLS.length;

  return (
    <Shell actor={actor} current="/cabinet/manage/tools">
      <ScreenHead
        title="Служебные разделы"
        note="Кухня практики: справочники, журналы, перенос книги заказов и учётные записи. Сюда заходят изредка, поэтому в первом ряду разделов их нет."
      />

      {groups.map((group) => (
        // Группа набрана `div`, а не `section`: сценарий движения сайта
        // забирает `main > section` и дописывает плашкам задержку
        // появления прямо в разметку, а снимок принимает облик, а не
        // движение (решения Р-186, Р-192).
        <div className="cab-block" key={group.key} style={{ marginBottom: 24 }}>
          <Heading level={2} size={3} style={{ marginBottom: 4 }}>
            {group.title}
          </Heading>
          <Text muted size={14} style={{ marginBottom: 14 }}>
            {group.note}
          </Text>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              // Не больше двух плашек в ряду: третья ужимает строки до
              // разрыва посреди слова (решение Р-189).
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px,100%),1fr))',
              gap: 16,
              maxWidth: 'calc(2 * 560px + 16px)',
            }}
          >
            {group.tools.map((tool) => (
              <Card as="li" key={tool.href} link>
                <Heading level={3} size={3} style={{ marginBottom: 4 }}>
                  <a href={tool.href}>{tool.title}</a>
                </Heading>
                <Text muted size={14}>
                  {tool.note}
                </Text>
              </Card>
            ))}
          </ul>
        </div>
      ))}

      {partial ? (
        <Text muted size={14}>
          Остальные служебные разделы — справочники, журналы, перенос книги заказов, учётные
          записи — ведёт руководитель практики.
        </Text>
      ) : null}
    </Shell>
  );
}
