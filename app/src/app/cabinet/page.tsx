import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import Shell from '../../components/cabinet/Shell';
import {
  Button,
  Card,
  Field,
  Form,
  FormActions,
  Heading,
  Mono,
  Notice,
  Text,
} from '../../components/cabinet/ui';
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
  searchParams: Promise<{ sent?: string; error?: string; channel?: string }>;
}) {
  const actor = await currentActor();
  if (actor !== null) redirect('/cabinet/projects');

  const params = await searchParams;

  return (
    <Shell actor={null} center>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <Mono>Личный кабинет</Mono>
        <Heading level={1} style={{ margin: '12px 0 16px' }}>
          Вход по ссылке
        </Heading>
        <Text style={{ marginBottom: 24 }}>
          Укажите адрес, на который оформлено сопровождение, — придёт письмо со ссылкой.
        </Text>

        {params.error === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice tone="error" role="alert">
              Ссылка недействительна: её уже использовали или истёк срок. Запросите новую.
            </Notice>
          </div>
        )}

        {params.channel === undefined ? null : (
          <div style={{ marginBottom: 20 }}>
            <Notice tone="error" role="alert">
              Вход по ссылке пока недоступен: почтовый канал практики не настроен, и письмо
              отправить некуда. Напишите куратору работы — он откроет доступ другим способом.
            </Notice>
          </div>
        )}

        {params.sent === undefined ? (
          <Card>
            <Form action={requestLink}>
              <Field
                label="Электронная почта"
                name="email"
                type="email"
                required
                placeholder="you@example.ru"
                hint="Тот адрес, который вы указывали при обращении."
              />
              <FormActions>
                <Button>Прислать ссылку</Button>
              </FormActions>
            </Form>
          </Card>
        ) : (
          <Notice>
            Если этот адрес зарегистрирован, письмо со ссылкой уже отправлено. Проверьте почту,
            в том числе папку со спамом.
          </Notice>
        )}

      </div>
    </Shell>
  );
}
