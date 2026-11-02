'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

import { LEAD_SENT_EVENT } from './LeadThanks';
import {
  dropCounterData,
  openCookieSettings,
  readChoice,
  saveChoice,
  type Choice,
} from './cookie-choice';

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
 * Выбор можно изменить в любой момент (решение Р-773, исполняет Р-250):
 * ссылка «Настройки cookies» в подвале стирает его и снова показывает
 * уведомление. Отказ после согласия стирает cookies счётчика и
 * перезагружает страницу — уже загруженный сценарий Метрики иначе
 * продолжал бы работать до ухода со страницы.
 *
 * Вебвизор, запись движений курсора и копирование форм не включаются
 * намеренно. Вебвизор пишет содержимое полей, то есть имя, телефон и тему
 * работы, и отправляет их третьему лицу. Это отдельная передача
 * персональных данных, для которой нужны своё основание в политике и своя
 * строка в уведомлении Роскомнадзора.
 */
const METRIKA_ID = process.env.NEXT_PUBLIC_METRIKA_ID;

/** Идентификатор цели «Заявка отправлена» в Метрике (Р-409). */
export const LEAD_GOAL = 'lead';

/** Хранилище выбора; в частном окне обращение к нему может бросить ошибку. */
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function Metrika() {
  // До монтирования выбора не знаем: на сервере localStorage нет. Держим
  // `undefined`, чтобы разметка сервера и первый проход в браузере совпали.
  const [choice, setChoice] = useState<Choice | undefined>(undefined);
  // Счётчик уже загружен на этой странице: отказ тогда требует перезагрузки.
  const started = useRef(false);
  // Уведомление открыто ссылкой «Настройки cookies» — фокус переводится на
  // него, чтобы с клавиатуры и в чтении экрана выбор был следующим шагом.
  const [reopened, setReopened] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  // Кабинет счётчику не показывается (Р-250): ключ входа стоит прямо в
  // адресе `/cabinet/enter/<ключ>`, а в строке поиска реестров бывают ФИО,
  // телефоны и почта — Метрика унесла бы их в свои отчёты, хотя политика
  // обещает, что содержание заявок сервису не передаётся. Уведомление о
  // cookies поверх экранов кабинета тоже не к месту. Переход с сайта в
  // кабинет — обычная ссылка с полной загрузкой, поэтому уже запущенный
  // на публичной странице счётчик в кабинет не переносится.
  const pathname = usePathname();
  const cabinet = pathname === '/cabinet' || (pathname ?? '').startsWith('/cabinet/');

  useEffect(() => {
    if (METRIKA_ID && !cabinet) setChoice(readChoice(store()));
  }, [cabinet]);

  // «Настройки cookies» в подвале (Р-773): ссылка ведёт в раздел политики,
  // а при включённом счётчике перехватывается — выбор стирается, и
  // уведомление появляется снова.
  useEffect(() => {
    if (!METRIKA_ID || cabinet) return;
    const onClick = (event: MouseEvent) => {
      if (!openCookieSettings(event, store())) return;
      setChoice(null);
      setReopened(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [cabinet]);

  useEffect(() => {
    if (choice === 'yes') started.current = true;
  }, [choice]);

  useEffect(() => {
    if (reopened && choice === null) region.current?.focus();
  }, [reopened, choice]);

  // Цель «Заявка отправлена» (идентификатор `lead`) — по тому же событию,
  // что открывает окно благодарности (Р-406): только успешная отправка,
  // только при включённом счётчике и данном согласии. Нужна Директу, чтобы
  // считать заявки и учиться на них (решение Р-409). В цель не кладётся
  // ничего из формы: ни контакта, ни текста — только сам факт отправки.
  useEffect(() => {
    if (!METRIKA_ID || cabinet || choice !== 'yes') return;
    const onSent = () => {
      const ym = (window as unknown as { ym?: (...args: unknown[]) => void }).ym;
      if (typeof ym === 'function') ym(Number(METRIKA_ID), 'reachGoal', LEAD_GOAL);
    };
    window.addEventListener(LEAD_SENT_EVENT, onSent);
    return () => window.removeEventListener(LEAD_SENT_EVENT, onSent);
  }, [cabinet, choice]);

  if (!METRIKA_ID || cabinet || choice === undefined) return null;

  const decide = (v: Exclude<Choice, null>) => {
    saveChoice(store(), v);
    setReopened(false);
    if (v === 'no' && started.current) {
      // Согласие отозвано, а сценарий счётчика уже работает на странице:
      // стираем его cookies и записи и загружаем страницу заново без него.
      dropCounterData(document, store(), window.location.hostname);
      window.location.reload();
      return;
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
      ref={region}
      tabIndex={-1}
      role="region"
      aria-label="Уведомление о файлах cookies"
      // По этой метке кнопка замечаний поднимается над уведомлением, пока
      // оно открыто: иначе на телефоне она закрывала бы «Разрешить»
      // (решение Р-403).
      data-pd-consent=""
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
        {/* Формулировка по Политике 1.1, раздел «Файлы cookies и
            веб-аналитика»; её согласует юрист (Р-773, решение по умолчанию).
            Политика относит к данным счётчика адрес соединения — текст
            перечисляет данные так же, как она. */}
        Сайт использует счётчик Яндекс.Метрики для анализа посещаемости и оценки удобства
        страниц. С вашего согласия счётчик сохраняет файлы cookies и получает адрес
        соединения, сведения о браузере и устройстве, просмотренные страницы и действия на
        них. Имя, контакты и содержание заявок ему не передаются. Изменить выбор можно
        ссылкой «Настройки cookies» внизу страниц сайта. Подробности —{' '}
        {/* Подчёркнута: по одному цвету ссылку в абзаце не отличить
            (axe, link-in-text-block) — как «напишите нам» на странице 404. */}
        <a
          href="/privacy#cookies"
          style={{
            color: 'var(--pd-accent)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            textDecorationThickness: 1,
          }}
        >
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
