/**
 * Состав раздела материалов по ролям (указание владельца 12.10.2026,
 * решение Р-555): что открывается на экране и что скачивается файлом.
 * Сотрудникам — в «Управлении», клиенту — в «Материалах»; клиенту только
 * его материалы (ответ владельца): чек-листы — порядок работы практики.
 */

import { can, type Actor } from './access.ts';
import { BRIEF_TEMPLATES } from './brief/templates.ts';
import { DOWNLOAD_HREF } from './downloads.ts';
import { CLIENT_MEMO } from './memos.ts';

export interface HubRow {
  readonly title: string;
  readonly note: string;
  readonly href?: string;
  readonly files: readonly { readonly href: string; readonly label: string }[];
}

const file = (key: string, label: string) => ({ href: `${DOWNLOAD_HREF}/${key}`, label });

const templateFiles = () =>
  BRIEF_TEMPLATES.map((template) => file(template.key, `${template.title.replace(' (Excel)', '')}, .${template.file.split('.').pop()}`));

/** Строка перечня материалов: название, пояснение, экран и файлы. */
/** Материалы клиента. */
export function clientMaterials(): HubRow[] {
  return [
    {
      title: 'Анкета заказа',
      note: 'Заполните перед новой заявкой: тема, вид работы, срок, вуз, научный руководитель. Стоимость не указывается.',
      files: BRIEF_TEMPLATES.filter((template) => template.key.startsWith('anketa')).map((template) =>
        file(template.key, template.file.endsWith('.xlsx') ? 'Скачать .xlsx' : 'Скачать .docx'),
      ),
    },
    {
      title: 'Исходные данные работы и статьи',
      note: 'Так устроен документ, который вы утверждаете перед началом работы: тема, цель, задачи, план, источники.',
      files: BRIEF_TEMPLATES.filter((template) => template.key.startsWith('iskhodnye')).map((template) =>
        file(template.key, `${template.title}, .docx`),
      ),
    },
    {
      title: CLIENT_MEMO.title,
      note: 'Вход, этапы и согласование, материалы и версии, переписка, оплаты, уведомления.',
      files: [file(CLIENT_MEMO.key, 'Скачать .docx')],
    },
  ];
}

/** Материалы сотрудника: чек-листы, шаблоны, памятка клиенту. */
export function staffMaterials(actor: Actor): HubRow[] {
  if (!can(actor, 'CHECKLIST_VIEW')) return [];
  return [
    {
      title: actor.role === 'HEAD' ? 'Чек-листы практики' : 'Мои чек-листы',
      note: 'Порядок дел по шагам: что сделать и на каком экране.',
      href: '/cabinet/manage/checklists',
      files: [file('chek-listy', 'Скачать .docx')],
    },
    {
      title: 'Чек-листы по видам работ',
      note: 'Что проверить на старте, по ходу и при сдаче — по виду сопровождения.',
      href: '/cabinet/manage/checklists?view=service',
      files: [file('chek-listy-po-vidam', 'Скачать .docx')],
    },
    {
      title: 'Шаблоны документов',
      note: 'Анкета заказа и исходные данные: кабинет сам заполняет из них форму заказа и карточку работы.',
      href: '/cabinet/manage/checklists?view=templates',
      files: templateFiles(),
    },
    {
      title: `Памятка клиенту: «${CLIENT_MEMO.title}»`,
      note: 'Можно передать клиенту файлом; клиент видит её в своих «Материалах».',
      files: [file(CLIENT_MEMO.key, 'Скачать .docx')],
    },
  ];
}
