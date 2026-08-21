/**
 * Соответствие «слот в макете → файл снимка».
 *
 * Пять снимков пришли внутри автономной сборки посадочной страницы, где были
 * упакованы как WebP с прозрачным фоном. Соответствие слотов взято оттуда же,
 * из шаблона сборки, — это исходная расстановка, а не догадка.
 *
 * Как добавить или заменить фотографию:
 *   1. положить файл в `app/public/photos/`;
 *   2. вписать сюда строку с точными размерами оригинала —
 *      они нужны браузеру, чтобы зарезервировать место и не дёргать
 *      вёрстку при загрузке.
 *
 * Пустая запись — не ошибка: слот покажет подписанную заглушку.
 *
 * Требования к файлам:
 *   · фон прозрачный или белый — портреты стоят на цветных подложках;
 *   · короткая сторона не меньше удвоенного размера слота (экран с двойной
 *     плотностью точек), иначе снимок будет мылить;
 *   · формат webp, вес до 250 КБ на снимок.
 *
 * Условие публикации каждого портрета — письменное согласие изображённого
 * лица. Решение Р-08 в docs/DECISIONS.md.
 */

export type Photo = {
  src: string;
  /** Размеры оригинала: без них браузер не резервирует место под снимок */
  width: number;
  height: number;
  /** Точка кадрирования, если лицо не по центру */
  position?: string;
};

const CURATOR:  Photo = { src: '/photos/curator.webp',  width: 380, height: 290, position: 'center 30%' };
const EDITOR:   Photo = { src: '/photos/editor.webp',   width: 171, height: 149, position: 'center 28%' };
const POSTGRAD: Photo = { src: '/photos/postgrad.webp', width: 572, height: 784, position: 'center top' };
const STUDENT:  Photo = { src: '/photos/student.webp',  width: 652, height: 682, position: 'center top' };
const BUSINESS: Photo = { src: '/photos/business.webp', width: 549, height: 549, position: 'center top' };

export const PHOTOS: Record<string, Photo> = {
  // ——— Посадочная: расстановка из исходной сборки ———
  'sp-avatar-1': CURATOR,     // круг 190px — куратор проекта
  'sp-avatar-2c': EDITOR,     // круг 130px — научный редактор
  'sp-route-1': POSTGRAD,     // полоса 355px — аспирантам
  'sp-route-2b': STUDENT,     // полоса 355px — студентам
  'sp-route-3': BUSINESS,     // полоса 355px — бизнесу

  // ——— Аспирантам: те же роли, что на посадочной ———
  'mp-photo-1': CURATOR,      // круг 168px — куратор
  'mp-photo-2': EDITOR,       // круг 112px — научный редактор
  'mp-request-photo': POSTGRAD, // блок заявки: аспирант с работой

  // ——— Студентам ———
  'sp-stud-1': STUDENT,       // круг 178px — студент
  'sp-stud-2': EDITOR,        // круг 122px — научный редактор
  'sp-request-photo': POSTGRAD,

  // ——— Бизнесу ———
  'bp-photo-1': BUSINESS,     // круг 178px — отраслевой эксперт
  'bp-photo-2': CURATOR,      // круг 122px — менеджер проекта

  // Слоты блоков «Вопросы» на двух страницах ждут снимка менеджера:
  // подходящего кадра среди присланных нет, заглушка остаётся честной.
  // 'mp-faq-photo': …
  // 'sp-faq-photo': …
};

/** Слоты первого экрана: грузятся сразу, а не по мере прокрутки */
export const ABOVE_THE_FOLD = new Set([
  'sp-avatar-1', 'sp-avatar-2c',
  'mp-photo-1', 'mp-photo-2',
  'sp-stud-1', 'sp-stud-2',
  'bp-photo-1', 'bp-photo-2',
]);
