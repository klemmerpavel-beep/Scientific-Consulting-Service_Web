import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import Shell from '../../components/cabinet/Shell';
import { Button, Card, Field, Heading, Mono, Notice, Text } from '../../components/cabinet/ui';
import { currentActor } from '../../lib/cabinet/session';
import { requestLink } from './actions';

export const metadata: Metadata = {
  title: 'Вход в личный кабинет — ProDisser',
  description: 'Вход в личный кабинет ProDisser по ссылке на электронную почту.',
  alternates: { canonical: '/cabinet' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CabinetEntrance({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const actor = await currentActor();
  if (actor !== null) redirect('/cabinet/projects');

  const params = await searchParams;

  return (
    <Shell actor={null}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Mono>Личный кабинет</Mono>
        <Heading level={1} style={{ margin: '12px 0 16px' }}>
          Вход по ссылке
        </Heading>
        <Text style={{ marginBottom: 24 }}>
          Пароля в кабинете нет. Укажите адрес, на который оформлено сопровождение, — придёт письмо
          со ссылкой. Ссылка действует пятнадцать минут и срабатывает один раз.
        </Text>

        {params.error === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice tone="error" role="alert">
              Ссылка недействительна: её уже использовали или истёк срок. Запросите новую.
            </Notice>
          </div>
        )}

        {params.sent === undefined ? (
          <Card>
            <form action={requestLink} style={{ display: 'grid', gap: 20 }}>
              <Field
                label="Электронная почта"
                name="email"
                type="email"
                required
                placeholder="you@example.ru"
                hint="Тот адрес, который вы указывали при обращении."
              />
              <Button>Прислать ссылку</Button>
            </form>
          </Card>
        ) : (
          <Notice>
            Если этот адрес зарегистрирован, письмо со ссылкой уже отправлено. Проверьте почту,
            в том числе папку со спамом.
          </Notice>
        )}

        <Text muted size={14} style={{ marginTop: 24 }}>
          Не получается войти — напишите менеджеру проекта или на{' '}
          <a href="mailto:info@prodisser.ru">info@prodisser.ru</a>.
        </Text>
      </div>
    </Shell>
  );
}
