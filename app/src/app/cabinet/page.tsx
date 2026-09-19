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

/**
 * Как устроен вход — тремя пунктами, а не абзацем.
 *
 * Прежде это был сплошной текст под заголовком: человек читал его как
 * вступление и пропускал, а потом ждал письма дольше, чем живёт ссылка.
 */
const ENTRY_RULES = [
  'Пароля в кабинете нет — каждый вход по новой ссылке из письма.',
  'Ссылка действует пятнадцать минут с момента запроса.',
  'Ссылка срабатывает один раз: после входа она гаснет.',
] as const;

const BULLET: React.CSSProperties = {
  flex: '0 0 auto',
  width: 6,
  height: 6,
  marginTop: 7,
  borderRadius: '50%',
  background: 'var(--pd-accent)',
};

export default async function CabinetEntrance({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; channel?: string }>;
}) {
  const actor = await currentActor();
  if (actor !== null) redirect('/cabinet/projects');

  const params = await searchParams;

  return (
    <Shell actor={null}>
      {/* Экран занимает высоту окна и стоит по центру: под формой была
          пустота в половину страницы, и вход выглядел обрывком (Р-164). */}
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
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

          <Card style={{ marginTop: 20 }}>
            <Heading level={2} size={3} style={{ marginBottom: 12 }}>
              Как устроен вход
            </Heading>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
              {ENTRY_RULES.map((rule) => (
                <li key={rule} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span aria-hidden="true" style={BULLET} />
                  <Text size={14} style={{ margin: 0 }}>
                    {rule}
                  </Text>
                </li>
              ))}
            </ul>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Heading level={2} size={3} style={{ marginBottom: 8 }}>
              Если войти не получается
            </Heading>
            <Text size={14} style={{ marginBottom: 6 }}>
              Письмо не пришло за несколько минут — посмотрите папку со спамом и запросите ссылку
              ещё раз: прежняя при этом перестаёт действовать.
            </Text>
            <Text size={14}>
              Адрес не подходит или доступа к нему нет — напишите куратору работы или на{' '}
              <a href="mailto:info@prodisser.ru">info@prodisser.ru</a>, доступ откроют на другой
              адрес.
            </Text>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
