import Shell from '../../components/cabinet/Shell';
import { Loading } from '../../components/cabinet/ui';
import { currentActor } from '../../lib/cabinet/session';

/**
 * Состояние загрузки для всех экранов кабинета.
 *
 * Экраны серверные, и до прихода выборок человек видел пустое поле:
 * непонятно, идёт ли что-нибудь. Бриф требует от экрана трёх состояний —
 * пусто, загрузка, ошибка, — и загрузки не было ни одной (решение Р-184).
 *
 * Скелет рисуется внутри настоящего каркаса, поэтому шапка и меню не
 * мигают: читается только сессия, одной выборкой по индексу, а не
 * содержимое экрана. Экраны со своим строем — панель заказа — держат
 * свой скелет рядом с собой.
 */
export default async function CabinetLoading() {
  const actor = await currentActor();
  return (
    <Shell actor={actor}>
      <Loading />
    </Shell>
  );
}
