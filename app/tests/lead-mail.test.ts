/**
 * Письмо о заявке с сайта (Р-259).
 *
 * Письмо уходит с текстовой версией: только HTML почтовые фильтры штрафуют.
 * Отзыв называется отзывом, роль автора не выдаётся за имя. Подпись несёт
 * все отметки журнала согласий. Чужой текст экранируется в HTML и не
 * разрывает заголовок темы.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NEXT_PUBLIC_SITE_URL = 'https://prodisser.ru';

const { leadMail } = await import('../src/lib/notify.ts');

const lead = {
  source: 'postgrad' as const,
  form: 'request',
  contactKind: 'email' as const,
  contact: 'aspirant@example.ru',
  name: 'Мария <b>Иванова</b>',
  speciality: '2.3.1',
  consent: true,
  terms: true,
  marketing: false,
  publish: false,
  company_website: '',
};

describe('письмо о заявке', () => {
  const mail = leadMail(lead as never, 'cmlead0001');

  it('есть текстовая версия с полями и ссылкой на кабинет', () => {
    assert.match(mail.text, /^Новая заявка с сайта/);
    assert.match(mail.text, /Специальность: 2\.3\.1/);
    assert.match(mail.text, /Открыть в кабинете: https:\/\/prodisser\.ru\/cabinet\/manage\/leads\/cmlead0001/);
  });

  it('подпись несёт все отметки журнала', () => {
    assert.match(mail.text, /согласие: да · оферта: да · рассылка: нет/);
    assert.match(mail.html, /согласие: да · оферта: да · рассылка: нет/);
  });

  it('чужой текст экранирован в HTML и не рвёт тему', () => {
    assert.ok(mail.html.includes('Мария &lt;b&gt;Иванова&lt;/b&gt;'));
    assert.ok(!mail.html.includes('<b>Иванова'));
    const broken = leadMail({ ...lead, name: 'Иван\r\nBcc: x@evil.test' } as never, 'id');
    assert.ok(!/[\r\n]/.test(broken.subject));
    assert.equal(broken.subject, 'Заявка · Аспирантам · Иван Bcc: x@evil.test');
  });
});

describe('письмо об отзыве', () => {
  const mail = leadMail(
    { ...lead, form: 'review', contact: '', name: 'соискатель, технические науки', message: 'Разобрали вторую главу', publish: true } as never,
    'cmrev0001',
  );

  it('называется отзывом, роль — не имя', () => {
    assert.equal(mail.subject, 'Отзыв · Аспирантам · соискатель, технические науки');
    assert.match(mail.text, /^Новый отзыв с сайта/);
    assert.match(mail.text, /Автор: соискатель, технические науки/);
    assert.doesNotMatch(mail.text, /Имя:/);
  });

  it('подпись говорит о разрешении на публикацию, а не о согласии', () => {
    assert.match(mail.text, /Отзыв cmrev0001 · публикация: да/);
    assert.doesNotMatch(mail.text, /согласие:/);
  });
});
