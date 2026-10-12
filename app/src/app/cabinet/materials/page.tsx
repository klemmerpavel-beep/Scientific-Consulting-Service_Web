import { redirect } from 'next/navigation';

import MaterialsList from '../../../components/cabinet/MaterialsList';
import Shell from '../../../components/cabinet/Shell';
import { ScreenHead } from '../../../components/cabinet/ui';
import { clientMaterials } from '../../../lib/cabinet/materials-hub';
import { homeFor } from '../../../lib/cabinet/nav';
import { ownerTemplates } from '../../../lib/cabinet/owner-templates';
import { requireActor } from '../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * «Материалы» клиента (указание владельца 12.10.2026, решение Р-555):
 * шаблоны документов и памятка по кабинету со скачиванием. Чек-листы
 * команды сюда не входят — это порядок работы практики (ответ владельца).
 * Шаблоны практики, адресованные всем, — тут же (решение Р-558).
 */
export default async function ClientMaterialsScreen() {
  const actor = await requireActor('/cabinet/materials');
  if (actor.role !== 'CLIENT') redirect(homeFor(actor));
  // Шаблоны практики — только адресованные всем (решение Р-558).
  const templates = await ownerTemplates(actor);
  return (
    <Shell actor={actor} current="/cabinet/materials">
      <ScreenHead
        title="Материалы"
        note="Шаблоны документов и памятка по кабинету. Файлы открываются в Word; чтобы сохранить страницу в PDF, напечатайте её: Ctrl + P, на Mac ⌘ + P, — и выберите «Сохранить в PDF»."
      />
      <MaterialsList title="Документы и памятки" note="Скачайте, заполните и приложите к заявке или пришлите менеджеру в переписке работы." rows={clientMaterials(templates)} />
    </Shell>
  );
}
