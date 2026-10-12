/**
 * Памятки для скачивания (указание владельца 12.10.2026, решение Р-555).
 * Клиенту — как работать в кабинете и что подготовить к началу работы
 * (Р-560). Кнопки названы теми же словами, что на экранах; проверка
 * сверяет их с кодом.
 */

import { docx, type DocBlock } from './docx.ts';
import { PREPARE_LISTS } from './prepare-lists.ts';

export interface Memo {
  readonly key: string;
  readonly title: string;
  readonly file: string;
  readonly ascii: string;
  readonly points: readonly string[];
}

export const CLIENT_MEMO: Memo = {
  key: 'pamyatka-klienta',
  title: 'Как работать в кабинете',
  file: 'Как работать в кабинете.docx',
  ascii: 'pamyatka-kabineta.docx',
  points: [
    'Вход — по одноразовой ссылке, которая приходит на почту; пароля нет. Для следующего входа запросите новую ссылку на странице входа.',
    '«Мои работы» — ваши работы. На карточке работы — план этапов, сроки и что сейчас нужно от вас.',
    'Материалы — кнопкой «Приложить материал» на карточке работы или «Загрузить» на экране этапа. Новая редакция файла — «Загрузить следующую версию»: прежние версии сохраняются.',
    'Этап на согласовании — «Согласовать этап» или «Вернуть с замечаниями» с перечнем, что поправить.',
    'Вопросы — менеджеру в переписке работы: она хранится в кабинете и видна обеим сторонам.',
    'Договор, счета и закрывающие документы — на экране «Оплаты и документы».',
    'Уведомления — письмом или в Telegram: «Подключить Telegram» в «Настройках».',
    'В начале работы — «Что подготовить» на карточке работы: материалы для старта по виду сопровождения; у каждого пункта — «Приложить».',
    'Новая работа — «Новая заявка»; к заявке можно приложить файлы. Заполненную анкету загрузите в «Заполнить из документа»: поля заполнятся сами, а анкета приложится к заявке.',
  ],
};

/** Памятка «Что подготовить» по всем видам сопровождения (Р-560). */
export const PREPARE_MEMO = {
  key: 'chto-podgotovit',
  title: 'Что подготовить к началу работы',
  file: 'Что подготовить к началу работы.docx',
  ascii: 'chto-podgotovit.docx',
} as const;

export function prepareDocx(): Buffer {
  const blocks: DocBlock[] = [
    { kind: 'title', text: PREPARE_MEMO.title },
    {
      kind: 'paragraph',
      muted: true,
      text: 'Пришлите эти материалы до согласования первого этапа: работа начнётся без переспросов. В кабинете — «Что подготовить» на карточке работы, у каждого пункта — «Приложить».',
    },
  ];
  for (const list of PREPARE_LISTS) {
    blocks.push({ kind: 'heading', text: list.title });
    for (const item of list.items) blocks.push({ kind: 'check', text: `${item.title}. ${item.note}` });
  }
  return docx(PREPARE_MEMO.title, blocks);
}

export function memoDocx(memo: Memo): Buffer {
  const blocks: DocBlock[] = [{ kind: 'title', text: memo.title }, ...memo.points.map((text) => ({ kind: 'paragraph' as const, text: `— ${text}` }))];
  return docx(memo.title, blocks);
}
