/**
 * Соответствие «слот в макете → снимок» и точка кадрирования.
 *
 * ——— Что изменилось в редизайне ———
 *
 * До редизайна в слотах стояли вырезанные по контуру фигуры на прозрачном
 * фоне. Под каждую приходилось считать кадрирование по альфа-каналу: где
 * начинается фигура, какой ширины голова, где её центр. Отсюда прежние поля
 * figTop/figH/figCx/figShown и два правила кадрирования — ROUTE и CARD_FULL.
 *
 * Снимки заменены на полнокадровые фотографии в квадрате: человек снят в
 * рабочей обстановке, кадр закрывает слот целиком. Вырезанного контура
 * больше нет, измерять по альфа-каналу нечего, и кадрирование сводится к
 * штатному `object-fit: cover` с одной точкой привязки на снимок.
 * Решение Р-53 в docs/DECISIONS.md.
 *
 * Точка привязки задаётся по вертикали и смещена вверх от середины: при
 * обрезке сохраняется лицо, а не нижняя часть кадра.
 *
 * Решением Р-60 три снимка маршрутов были переведены в документальную манеру:
 * человек занят делом и в объектив не смотрит. Решение Р-83 отменяет эту часть
 * Р-60 для карточек маршрутов и блоков вопросов: там человек смотрит в
 * объектив и открыт к разговору — оба блока зовут написать, а отстранённый
 * кадр этому противоречит. Отстранённая манера осталась только у круглых
 * портретов первого экрана (CURATOR, EDITOR, EXPERT): там человек показан за
 * работой, а не в диалоге.
 *
 * Изображения синтезированы и не изображают конкретных людей — на них не
 * распространяется требование письменного согласия по решению Р-08. Модель,
 * промпты и запрет на выдачу таких снимков за фотографии сотрудников
 * зафиксированы решением Р-53.
 */

export type Photo = {
  src: string;
  /** Размеры файла: без них браузер не резервирует место под снимок */
  width: number;
  height: number;
  /** Точка кадрирования при `object-fit: cover` */
  position: string;
};

export type Slot = { photo: Photo };

const CURATOR: Photo = {
  src: '/photos/curator.webp', width: 480, height: 480, position: 'center 38%',
};
const EDITOR: Photo = {
  src: '/photos/editor.webp', width: 340, height: 340, position: 'center 38%',
};
const POSTGRAD: Photo = {
  src: '/photos/postgrad.webp', width: 680, height: 680, position: 'center 24%',
};
const STUDENT: Photo = {
  src: '/photos/student.webp', width: 680, height: 680, position: 'center 40%',
};
const BUSINESS: Photo = {
  src: '/photos/business.webp', width: 680, height: 680, position: 'center 28%',
};
// Преподаватель у доски: приветливый кадр в аудитории для блока вопросов
// на странице «Студентам» (решение Р-73). Единственный снимок серии, где
// человек смотрит в объектив и улыбается: блок зовёт задать вопрос, и
// отстранённая манера остальных кадров ему противоречит.
const LECTURER: Photo = {
  src: '/photos/lecturer.webp', width: 680, height: 680, position: 'center 30%',
};
// Блок вопросов на «Аспирантам»: научный руководитель за рабочим столом
// с рукописью. Тот же приветливый разворот, что у LECTURER и BLUEPRINTS:
// во всех трёх блоках вопросов человек смотрит в объектив.
const ADVISER: Photo = {
  src: '/photos/adviser.webp', width: 680, height: 680, position: 'center 34%',
};
// Блок вопросов на «Компаниям»: руководитель проекта с чертежами и папками
// у рабочего стола. Кадр репортажный, как LECTURER на «Студентам»: в блоке
// вопросов на всех трёх профильных страницах стоит сцена, а не портрет.
const BLUEPRINTS: Photo = {
  src: '/photos/blueprints.webp', width: 680, height: 680, position: 'center 30%',
};
// Отраслевой эксперт: студийный портрет той же серии, что CURATOR и EDITOR.
// Репортажный кадр в кабинете рядом с ними читался как чужая съёмка, а в
// круге 178px общий план к тому же давал лицо мельче подписи.
const EXPERT: Photo = {
  src: '/photos/expert.webp', width: 480, height: 480, position: 'center 38%',
};

export const PHOTOS: Record<string, Slot> = {
  // ——— Посадочная ———
  'sp-avatar-1': { photo: CURATOR },    // круг 190px — куратор проекта
  'sp-avatar-2c': { photo: EDITOR },    // круг 130px — научный редактор
  'sp-route-1': { photo: POSTGRAD },    // аспирантам
  'sp-route-2b': { photo: STUDENT },    // студентам
  'sp-route-3': { photo: BUSINESS },    // бизнесу

  // ——— Аспирантам ———
  'mp-photo-1': { photo: CURATOR },     // круг 168px
  'mp-photo-2': { photo: EDITOR },      // круг 112px
  'mp-request-photo': { photo: STUDENT },
  'mp-faq-photo': { photo: ADVISER },

  // ——— Студентам ———
  'sp-stud-1': { photo: CURATOR },      // круг до 224px — куратор проекта
  'sp-stud-2': { photo: EDITOR },       // круг до 162px — научный редактор
  'sp-request-photo': { photo: STUDENT },
  'sp-faq-photo': { photo: LECTURER },

  // ——— Бизнесу ———
  'bp-photo-1': { photo: EXPERT },      // круг 178px
  'bp-photo-2': { photo: CURATOR },     // круг 122px
  'bp-faq-photo': { photo: BLUEPRINTS }, // кадр во всю карточку, как на двух других профильных
};

/** Слоты первого экрана: грузятся сразу, а не по мере прокрутки */
export const ABOVE_THE_FOLD = new Set([
  'sp-avatar-1', 'sp-avatar-2c',
  'mp-photo-1', 'mp-photo-2',
  'sp-stud-1', 'sp-stud-2',
  'bp-photo-1', 'bp-photo-2',
]);
