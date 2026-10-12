/**
 * Состав раздела материалов по ролям (указание владельца 12.10.2026,
 * решение Р-559): что открывается на экране и что скачивается файлом.
 * Сотрудникам — в «Управлении», клиенту — в «Материалах»; клиенту только
 * его материалы (ответ владельца): чек-листы — порядок работы практики.
 * Шаблоны практики, загруженные руководителем (решение Р-562), экран
 * читает сам и передаёт сюда: модуль остаётся без базы.
 */

import { can, type Actor } from './access.ts';
import { BRIEF_TEMPLATES } from './brief/templates.ts';
import { DOWNLOAD_HREF, OWNER_TEMPLATE_PREFIX } from './downloads.ts';
import { CLIENT_MEMO, PREPARE_MEMO } from './memos.ts';

export interface HubRow {
  readonly title: string;
  readonly note: string;
  readonly href?: string;
  readonly files: readonly { readonly href: string; readonly label: string }[];
}

/** Шаблон практики в перечне: что нужно строке и ссылке. */
export interface OwnerTemplateEntry {
  readonly id: string;
  readonly title: string;
  readonly note: string | null;
  readonly originalName: string;
}

const file = (key: string, label: string) => ({ href: `${DOWNLOAD_HREF}/${key}`, label });

/**
 * Ссылка на шаблон практики. Подпись — «Скачать .docx» или, в общей строке
 * сотрудника, «Договор, .docx», как у встроенных шаблонов.
 */
export function ownerTemplateLink(template: OwnerTemplateEntry, named = false) {
  const ext = /\.([a-z0-9]{1,10})$/iu.exec(template.originalName)?.[1]?.toLowerCase();
  const label = named ? template.title : 'Скачать';
  return file(`${OWNER_TEMPLATE_PREFIX}${template.id}`, ext === undefined ? label : `${label}${named ? ',' : ''} .${ext}`);
}

const templateFiles = () =>
  BRIEF_TEMPLATES.map((template) => file(template.key, `${template.title.replace(' (Excel)', '')}, .${template.file.split('.').pop()}`));

/** Материалы клиента; шаблоны практики — только адресованные всем. */
export function clientMaterials(templates: readonly OwnerTemplateEntry[] = []): HubRow[] {
  return [
    {
      title: 'Анкета для заявки',
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
      title: PREPARE_MEMO.title,
      note: 'Что прислать по виду сопровождения, чтобы работа началась без переспросов. На карточке работы — тот же перечень с кнопкой «Приложить».',
      files: [file(PREPARE_MEMO.key, 'Скачать .docx')],
    },
    {
      title: CLIENT_MEMO.title,
      note: 'Вход, этапы и согласование, материалы и версии, переписка, оплаты, уведомления.',
      files: [file(CLIENT_MEMO.key, 'Скачать .docx')],
    },
    ...templates.map((template) => ({
      title: template.title,
      note: template.note ?? 'Документ практики: скачайте и прочитайте до начала работы.',
      files: [ownerTemplateLink(template)],
    })),
  ];
}

/** Материалы сотрудника: чек-листы, шаблоны, шаблоны практики, памятка клиенту. */
export function staffMaterials(actor: Actor, templates: readonly OwnerTemplateEntry[] = []): HubRow[] {
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
      note: 'Анкета для заявки и исходные данные: кабинет сам заполняет из них форму нового заказа и карточку работы.',
      href: '/cabinet/manage/checklists?view=templates',
      files: templateFiles(),
    },
    // Шаблоны практики — строкой, когда руководитель их загрузил; самому
    // руководителю — и пустой: оттуда он переходит к загрузке.
    ...(templates.length === 0 && actor.role !== 'HEAD'
      ? []
      : [
          {
            title: 'Шаблоны практики',
            note:
              templates.length === 0
                ? 'Договор, техническое задание, памятки — ваши файлы. Загружаются в кабинете и в открытый код сайта не попадают.'
                : 'Договор, техническое задание, памятки практики — файлы руководителя.',
            href: '/cabinet/manage/checklists?view=templates#practice-templates',
            files: templates.map((template) => ownerTemplateLink(template, true)),
          },
        ]),
    {
      title: 'Памятки клиенту',
      note: 'Можно передать клиенту файлом; клиент видит их в своих «Материалах».',
      files: [file(CLIENT_MEMO.key, `${CLIENT_MEMO.title}, .docx`), file(PREPARE_MEMO.key, `${PREPARE_MEMO.title}, .docx`)],
    },
  ];
}
