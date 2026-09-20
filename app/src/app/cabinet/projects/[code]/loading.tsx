import Shell from '../../../../components/cabinet/Shell';
import { Loading } from '../../../../components/cabinet/ui';
import { currentActor } from '../../../../lib/cabinet/session';

/**
 * Загрузка панели заказа.
 *
 * У экрана заказа свой строй: шапка одной полосой, блок готовности и ряд
 * колонок. Общий скелет рисовал бы ленту карточек и подменял бы
 * раскладку на время загрузки (решение Р-184).
 */
export default async function ProjectLoading() {
  const actor = await currentActor();
  return (
    <Shell actor={actor} current="/cabinet/projects" board>
      <Loading blocks={3} rows={5} />
    </Shell>
  );
}
