'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

/**
 * Счётчик посещаемости и уведомление о файлах cookies.
 *
 * Выключен, пока не задан номер: без `NEXT_PUBLIC_METRIKA_ID` компонент не
 * отдаёт ничего — ни счётчика, ни уведомления, — и со страниц не уходит ни
 * одного внешнего запроса. Номер читается при сборке, как и остальные
 * `NEXT_PUBLIC_*`, поэтому включение — это пересборка образа.
 *
 * Счётчик запускается только после согласия посетителя. Так требует
 * политика: правовым основанием обработки данных о посещении названо
 * согласие, выражаемое в этом самом уведомлении. Пока выбор не сделан,
 * счётчик не грузится и cookies сервиса не ставятся; отказ запоминается
 * так же, как согласие, и уведомление больше не показывается.
 *
 * Вебвизор, запись движений курсора и копирование форм не включаются
 * намеренно. Вебвизор пишет содержимое полей, то есть имя, телефон и тему
 * работы, и отправляет их третьему лицу. Это отдельная передача
 * персональных данных, для которой нужны своё основание в политике и своя
 * строка в уведомлении Роскомнадзора.
 */
const METRIKA_ID = process.env.NEXT_PUBLIC_METRIKA_ID;

/** Ключ выбора посетителя. Хранится у него в браузере и никуда не уходит. */
const KEY = 'pd-analytics';

type Choice = 'yes' | 'no' | null;

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    // Частное окно или запрещённые данные сайта: считаем, что выбора нет.
    return null;
  }
}

export default function Metrika() {
  // До монтирования выбора не знаем: на сервере localStorage нет. Держим
  // `undefined`, чтобы разметка сервера и первый проход в браузере совпали.
  const [choice, setChoice] = useState<Choice | undefined>(undefined);

  useEffect(() => {
    if (METRIKA_ID) setChoice(readChoice());
  }, []);

  if (!METRIKA_ID || choice === undefined) return null;

  const decide = (v: Exclude<Choice, null>) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // Записать не удалось — уведомление появится снова. Это лучше, чем
      // считать согласие полученным без возможности его подтвердить.
    }
    setChoice(v);
  };

  if (choice === 'yes') {
    return (
      <Script id="pd-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<e.scripts.length;j++){if(e.scripts[j].src===r){return}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${Number(METRIKA_ID)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:false});`}
      </Script>
    );
  }

  if (choice === 'no') return null;

  const btn: React.CSSProperties = {
    appearance: 'none',
    cursor: 'pointer',
    minHeight: 44,
    padding: '0 20px',
    borderRadius: 999,
    fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
  };

  return (
    <div
      role="region"
      aria-label="Уведомление о файлах cookies"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 50,
        margin: '0 auto',
        maxWidth: 720,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
        padding: '16px 20px',
        background: 'var(--pd-ink-inverse)',
        border: '1px solid var(--pd-border)',
        borderRadius: 14,
        boxShadow: '0 12px 32px rgba(20,22,28,.14)',
      }}
    >
      <p
        style={{
          flex: '1 1 320px',
          margin: 0,
          fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--pd-ink-secondary)',
        }}
      >
        Сайт собирает статистику посещений счётчиком Яндекс.Метрики. Данные обезличены и
        используются только для оценки удобства страниц. Подробности —{' '}
        <a href="/privacy#cookies" style={{ color: 'var(--pd-accent)' }}>
          в политике
        </a>
        .
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => decide('no')}
          style={{
            ...btn,
            background: 'transparent',
            border: '1px solid var(--pd-edge-neutral)',
            color: 'var(--pd-ink)',
          }}
        >
          Отказаться
        </button>
        <button
          type="button"
          onClick={() => decide('yes')}
          style={{
            ...btn,
            background: 'var(--pd-ink)',
            border: 0,
            color: 'var(--pd-ink-inverse)',
          }}
        >
          Разрешить
        </button>
      </div>
    </div>
  );
}
