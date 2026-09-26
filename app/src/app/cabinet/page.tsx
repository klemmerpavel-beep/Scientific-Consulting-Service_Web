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
  Notice,
  Outcome,
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
      {/* Страница входа сведена к одному действию: заголовок, поле, кнопка
          и строка о том, как устроен вход. Пояснительный абзац про адрес
          снят по требованию заказчика — то же самое говорит подсказка
          поля, и говорить это дважды незачем (решение Р-193). */}
      <div style={{ width: '100%', maxWidth: 440 }}>
        <Heading level={1} style={{ marginBottom: 20 }}>
          Личный кабинет
        </Heading>

        {params.error === undefined ? null : (
          <Outcome tone="error">
            Ссылка недействительна: её уже использовали или истёк срок. Запросите новую.
          </Outcome>
        )}

        {params.channel === undefined ? null : (
          <Outcome tone="error">
            Вход по ссылке пока недоступен: почтовый канал практики не настроен, и письмо
            отправить некуда. Напишите куратору работы — он откроет доступ другим способом.
          </Outcome>
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
                hint="Тот адрес, на который оформлено сопровождение."
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

        <Text muted size={13} style={{ marginTop: 16 }}>
          Пароля нет: ссылка приходит на почту, действует пятнадцать минут и срабатывает один
          раз.
        </Text>
      </div>
    </Shell>
  );
}
