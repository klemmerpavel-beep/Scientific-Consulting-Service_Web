'use client';

import React from 'react';
import { PHOTOS } from './photos';

/**
 * Слот под фотографию.
 *
 * В макетах это компонент среды прототипирования `<image-slot>` с
 * перетаскиванием файла. В продакшене он не существует — браузер видел
 * неизвестный тег и не рисовал ничего, оставляя на месте портретов пустоту.
 *
 * Здесь слот ведёт себя честно в обоих состояниях: есть файл — показывает
 * снимок, нет файла — показывает подписанную заглушку, по которой видно,
 * какой именно портрет сюда встанет.
 *
 * Круглые портреты кадрируются штатным `cover`. Прямоугольные слоты, где
 * человек стоит в полный рост, кадрируются по измерениям снимка — правило
 * и причина описаны в `photos.ts`.
 */

type Props = {
  /** Идентификатор слота из макета — по нему ищется файл */
  slotId: string;
  /** Круглый портрет или прямоугольная полоса */
  shape?: 'circle' | 'rect';
  /** cover — заполнить кадр, contain — вписать целиком */
  fit?: 'cover' | 'contain';
  /** Описание для тех, кто не видит изображение */
  alt: string;
  /** Подпись заглушки, пока файла нет */
  placeholder?: string;
  /** Снимок в первом экране грузится сразу, остальные — по мере прокрутки */
  priority?: boolean;
  /** Класс из макета: снимки выводятся в цвете, обесцвечивание снято (Р-11) */
  className?: string;
  style?: React.CSSProperties;
};

export default function PhotoSlot({
  slotId,
  shape = 'rect',
  fit = 'cover',
  alt,
  placeholder,
  priority = false,
  className,
  style,
}: Props) {
  const slot = PHOTOS[slotId];
  const radius = shape === 'circle' ? '50%' : '10px';

  const box: React.CSSProperties = {
    ...style,
    boxSizing: 'border-box',
    borderRadius: radius,
    overflow: 'hidden',
  };

  if (!slot) {
    // Заглушка: подписана, не кликается, скрыта от чтения с экрана —
    // название файла посетителю ничего не говорит.
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 10,
          // Подложка не закрашивается: по канону цветной круг или полоса
          // под портретом видны и в пустом состоянии.
          background: 'transparent',
          border: '1px dashed rgba(22,18,28,.22)',
          fontSize: 12,
          lineHeight: 1.5,
          // Подпись читается на всех фактических подложках проекта.
          color: '#3A3247',
        }}
      >
        {placeholder ?? 'Фото'}
      </div>
    );
  }

  const { photo, frame } = slot;

  const common = {
    className,
    src: photo.src,
    alt,
    width: photo.width,
    height: photo.height,
    loading: (priority ? 'eager' : 'lazy') as 'eager' | 'lazy',
    fetchPriority: (priority ? 'high' : 'auto') as 'high' | 'auto',
    decoding: 'async' as const,
  };

  if (frame) {
    if (frame.by === 'figure') {
      // Всё считается долями от слота, а не пикселями: слот на узком экране
      // сжимается, и пиксельные значения разъезжались бы.
      //
      // `figShown` — какую часть фигуры показывать. Нужна там, где человек
      // снят длиннее остальных.
      const shown = photo.figShown ?? photo.figH;

      // Высота снимка как доля высоты слота: чтобы фигура заняла заданную
      // долю, весь кадр должен быть во столько же раз выше.
      const heightPct = (frame.figureHPct * photo.height) / shown;

      // Сдвиги считаются в процентах от собственного размера снимка —
      // проценты в `transform` отсчитываются именно от него.
      const shiftXPct = (0.5 - photo.figCx / photo.width) * 100;
      const shiftYPct = -(photo.figTop / photo.height) * 100;

      return (
        <span style={{ ...box, display: 'block', position: 'relative' }}>
          <img
            {...common}
            style={{
              display: 'block',
              position: 'absolute',
              left: '50%',
              top: `${frame.topPct}%`,
              height: `${heightPct.toFixed(2)}%`,
              width: 'auto',
              maxWidth: 'none',
              transform: `translate(calc(-50% + ${shiftXPct.toFixed(2)}%), ${shiftYPct.toFixed(2)}%)`,
            }}
          />
        </span>
      );
    }

    // По голове: масштаб задаётся требуемой шириной головы, с центром слота
    // сводится центр головы. Лица в соседних карточках выходят одного
    // размера; фигура при этом уходит за кромку и обрезается.
    const k = frame.headW / photo.headW;
    const drawnW = photo.width * k;
    const drawnH = photo.height * k;
    const shiftX = drawnW / 2 - photo.headCx * k;
    const vertical =
      frame.anchor === 'top'
        ? { top: `${((frame.headroom ?? 0) - photo.figTop * k).toFixed(1)}px` }
        : { bottom: 0 };

    return (
      <span style={{ ...box, display: 'block', position: 'relative' }}>
        <img
          {...common}
          style={{
            display: 'block',
            position: 'absolute',
            left: '50%',
            ...vertical,
            transform: `translateX(calc(-50% + ${shiftX.toFixed(1)}px))`,
            width: `${drawnW.toFixed(1)}px`,
            height: `${drawnH.toFixed(1)}px`,
            maxWidth: 'none',
          }}
        />
      </span>
    );
  }

  return (
    <img
      {...common}
      style={{
        ...box,
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: fit,
        // Люди на снимках стоят по центру, но кадрируются сверху:
        // при обрезке важнее сохранить лицо, а не ноги.
        objectPosition: photo.position ?? (shape === 'circle' ? 'center top' : 'center 20%'),
      }}
    />
  );
}
