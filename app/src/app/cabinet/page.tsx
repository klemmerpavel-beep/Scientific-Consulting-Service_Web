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
import { currentActor, openIntent, staleLink } from '../../lib/cabinet/session';
import { TOKEN_TTL_MINUTES } from '../../lib/cabinet/token';
import { homeFor } from '../../lib/cabinet/nav';
import { requestLink, resendStaleLink } from './actions';

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
  // Открытая сессия ведёт на начальный экран роли (требование М-05, Р-305).
  if (actor !== null) redirect(homeFor(actor));

  const params = await searchParams;
  // Пришёл из письма или сигнала: адрес почты подставлен, а после входа
  // человек вернётся на экран события (требование Т-06, решение Р-309).
  const intent = await openIntent();
  // Мёртвая ссылка: кнопка «Прислать новую ссылку» уходит владельцу старой,
  // адрес не раскрывается (требование Т-07, решение Р-313).
  const stale = params.error === undefined ? null : await staleLink();

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
          <Outcome tone="error">Ссылка устарела или уже использована.</Outcome>
        )}
        {stale === null ? null : (
          <Form action={resendStaleLink}>
            <FormActions>
              <Button>Прислать новую ссылку</Button>
            </FormActions>
          </Form>
        )}

        {params.channel === undefined ? null : (
          <Outcome tone="error">
            Вход по ссылке пока недоступен: отправка писем ProDisser ещё не настроена. Напишите
            куратору работы — он откроет доступ другим способом.
          </Outcome>
        )}

        {params.sent === undefined ? (
          <>
            <Card>
              <Form action={requestLink}>
                {intent === null ? null : <input type="hidden" name="next" value={intent.to} />}
                <Field
                  label="Электронная почта"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.ru"
                  hint="Тот адрес, на который оформлено сопровождение."
                  defaultValue={intent?.email ?? undefined}
                />
                <FormActions>
                  <Button>Прислать ссылку</Button>
                </FormActions>
              </Form>
            </Card>
            {/* Путь для того, у кого учётной записи нет (Т-07, Р-313). */}
            <Text size={14} style={{ marginTop: 16 }}>
              Ещё не работаете с нами?{' '}
              <a className="cab-mark" href="/#request">
                Оставить заявку
              </a>
            </Text>
          </>
        ) : (
          <>
            {/* Оговорка «если адрес зарегистрирован» остаётся: ответ один для
                любого адреса (Р-163). Срок ссылки — из той же постоянной,
                что и в письме; повтор не раньше чем через минуту (Р-313). */}
            <Notice>
              Если адрес зарегистрирован, письмо уже отправлено. Ссылка действует{' '}
              {TOKEN_TTL_MINUTES} минут. Проверьте папку «Спам». Прислать ещё раз можно через
              минуту.
            </Notice>
            {intent?.email == null ? null : (
              <Form action={requestLink}>
                <input type="hidden" name="email" value={intent.email} />
                <input type="hidden" name="next" value={intent.to} />
                <FormActions>
                  <Button tone="quiet">Прислать ещё раз</Button>
                </FormActions>
              </Form>
            )}
          </>
        )}

        <Text muted size={13} style={{ marginTop: 16 }}>
          Пароля нет: ссылка приходит на почту, действует пятнадцать минут и срабатывает один
          раз.
        </Text>
      </div>
    </Shell>
  );
}
