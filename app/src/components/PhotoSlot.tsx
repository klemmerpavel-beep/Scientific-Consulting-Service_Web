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
 * Все слоты кадрируются штатным `object-fit` с точкой привязки из
 * `photos.ts`: снимки полнокадровые, вырезанных по контуру фигур больше
 * нет, поэтому отдельной геометрии под них не требуется.
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

  const { photo } = slot;

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

  return (
    <img
      {...common}
      style={{
        ...box,
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: fit,
        // Точка привязки смещена вверх от середины кадра: при обрезке
        // важнее сохранить лицо, а не нижнюю часть снимка.
        objectPosition: photo.position,
      }}
    />
  );
}
