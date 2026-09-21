'use client';

import { useId, useState } from 'react';

import { BUTTON_QUIET, SANS } from './tokens.ts';

/**
 * Выбор файла в строе кабинета.
 *
 * Нативное поле `input[type=file]` рисует браузер, и подпись на нём — из
 * локали операционной системы: в русском кабинете стояли «Choose File» и
 * «No file chosen», а вид кнопки менялся от системы к системе. Поле
 * скрыто и связано с меткой, которая выглядит как обычная тихая кнопка;
 * рядом — имя и размер выбранного файла (решение Р-178).
 *
 * Это вторая и последняя часть кабинета, работающая в браузере, и ровно
 * по той же причине, что первая: имя выбранного файла знает только
 * браузер, и без него человек не видит, что именно он приложил.
 */
export function FilePick({
  name,
  id,
  accept,
  required = false,
  multiple = false,
  describedBy,
}: {
  name: string;
  id: string;
  accept?: string;
  required?: boolean;
  /** Можно выбрать несколько файлов: вложения к заявке (решение Р-191). */
  multiple?: boolean;
  describedBy?: string;
}) {
  const [picked, setPicked] = useState<{ name: string; size: number }[]>([]);
  const labelId = useId();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        required={required}
        aria-describedby={describedBy}
        style={{
          // Поле остаётся в дереве и получает фокус с клавиатуры: спрятать
          // его через `display:none` значило бы вынуть из обхода.
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={(event) => {
          setPicked(
            [...(event.target.files ?? [])].map((file) => ({ name: file.name, size: file.size })),
          );
        }}
      />
      <label htmlFor={id} id={labelId} style={{ ...BUTTON_QUIET, cursor: 'pointer' }}>
        {picked.length === 0 ? (multiple ? 'Выбрать файлы' : 'Выбрать файл') : 'Выбрать другие'}
      </label>
      <span
        aria-live="polite"
        style={{ fontFamily: SANS, fontSize: 14, color: 'var(--pd-ink-secondary)' }}
      >
        {picked.length === 0
          ? multiple
            ? 'файлы не выбраны'
            : 'файл не выбран'
          : picked.map((file) => `${file.name} · ${size(file.size)}`).join('; ')}
      </span>
    </div>
  );
}

/** Размер файла словами: килобайты до мегабайта, дальше мегабайты. */
function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} КБ`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} МБ`;
}
