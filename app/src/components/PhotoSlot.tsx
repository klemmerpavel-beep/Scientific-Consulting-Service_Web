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
 * какой именно портрет сюда встанет. Заглушка не выглядит поломкой и не
 * притворяется фотографией.
 *
 * Соответствие «слот → файл» живёт в `photos.ts`: добавить снимок значит
 * положить файл в `public/photos` и вписать одну строку.
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
  /**
   * Фотополосы карточек направлений: чёрно-белый снимок раскрывается в цвет
   * при наведении на всю карточку. Правило раскраски живёт в стилях макета
   * (`.pd-routeimg`), здесь только имя класса.
   */
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
  const photo = PHOTOS[slotId];
  const radius = shape === 'circle' ? '50%' : '10px';

  const box: React.CSSProperties = {
    ...style,
    boxSizing: 'border-box',
    borderRadius: radius,
    overflow: 'hidden',
  };

  if (!photo) {
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
          // под портретом видны и в пустом состоянии. Своя заливка их
          // перекрывала и обесцвечивала первый экран.
          background: 'transparent',
          border: '1px dashed rgba(22,18,28,.22)',
          fontSize: 12,
          lineHeight: 1.5,
          // Подпись читается на всех фактических подложках проекта.
          // #4A4157 давал 4.28 на лаванде «Аспирантам» (#C79AF3) — мало.
          color: '#3A3247',
        }}
      >
        {placeholder ?? 'Фото'}
      </div>
    );
  }

  return (
    <img
      className={className}
      src={photo.src}
      alt={alt}
      width={photo.width}
      height={photo.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
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
