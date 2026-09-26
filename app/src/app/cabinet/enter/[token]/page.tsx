import type { Metadata } from 'next';

import Shell from '../../../../components/cabinet/Shell';
import { Button, Form, Heading, Text } from '../../../../components/cabinet/ui';
import { loginLinkOwner } from '../../../../lib/cabinet/auth';
import { enterByLink } from '../../actions';

export const metadata: Metadata = {
  title: 'Вход в личный кабинет — ProDisser',
  robots: { index: false, follow: false },
  // Ссылка несёт одноразовый ключ: адрес страницы не должен уходить
  // заголовком Referer ни на какой другой узел.
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

/**
 * Вход по ссылке — нажатием, а не открытием.
 *
 * Прежде ключ гасился при первом же GET-запросе. Предпросмотр ссылки в
 * Telegram и WhatsApp и проверщики ссылок в почте запрашивают адрес сами:
 * ссылка тратилась раньше, чем человек её открывал, а тот, кто её
 * запросил первым, получал живую сессию. Теперь открытие только
 * показывает кнопку; ключ гасит отправка формы — её роботы не делают
 * (решение Р-232).
 *
 * Рядом с кнопкой — замаскированный адрес владельца ссылки: ссылку на
 * свой адрес злоумышленник мог подсунуть человеку, и тот, нажав «Войти»,
 * работал бы в чужой записи (решение Р-251). Адрес показывается только
 * при действующем ключе целиком — существование ключей по странице
 * по-прежнему не угадать.
 */
export default async function EnterByLink({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const owner = await loginLinkOwner(token);

  return (
    <Shell actor={null} center>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <Heading level={1} style={{ marginBottom: 12 }}>
          Вход в личный кабинет
        </Heading>
        <Text style={{ marginBottom: owner === null ? 24 : 12 }}>
          Ссылка одноразовая: после входа она перестаёт действовать.
        </Text>
        {owner === null ? null : (
          <Text style={{ marginBottom: 24 }}>
            Вход в запись <strong style={{ fontWeight: 600 }}>{owner}</strong>. Если это не ваш адрес,
            не нажимайте «Войти»: ссылку выдали на чужую почту.
          </Text>
        )}
        <Form action={enterByLink}>
          <input type="hidden" name="token" value={token} />
          <Button>Войти</Button>
        </Form>
      </div>
    </Shell>
  );
}
