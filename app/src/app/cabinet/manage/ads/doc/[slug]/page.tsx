import { notFound, redirect } from 'next/navigation';

import { ADS_REGISTRY } from '../../../../../../../content/ads-registry.generated';
import AdsDocument from '../../../../../../components/cabinet/AdsDocument';
import Shell from '../../../../../../components/cabinet/Shell';
import { Card, ScreenHead } from '../../../../../../components/cabinet/ui';
import { can } from '../../../../../../lib/cabinet/access';
import { homeFor } from '../../../../../../lib/cabinet/nav';
import { requireActor } from '../../../../../../lib/cabinet/session';

export const dynamic = 'force-dynamic';

/**
 * Документ папки `marketing/` в кабинете руководителя (решение Р-550):
 * стратегия, исследования, настройки кампаний — без перехода в
 * репозиторий. Текст тот же, что в файле; разметку строит React.
 */
export default async function AdsDocScreen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActor(`/cabinet/manage/ads/doc/${slug}`);
  if (!can(actor, 'ANALYTICS_VIEW')) redirect(homeFor(actor));
  const doc = ADS_REGISTRY.docs.find((item) => item.slug === slug);
  if (doc === undefined) notFound();

  return (
    <Shell actor={actor} current="/cabinet/manage/ads">
      <ScreenHead
        backHref="/cabinet/manage/ads?tab=works"
        backLabel="Работы и документы"
        title={doc.title}
        note={`${doc.group} · marketing/${doc.path}`}
      />
      <Card>
        <AdsDocument doc={doc} docs={ADS_REGISTRY.docs} />
      </Card>
    </Shell>
  );
}
