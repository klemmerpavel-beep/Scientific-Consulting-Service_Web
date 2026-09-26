import { Notice } from './ui';

/**
 * Отказ действия, переданный экрану адресом (`?error=`).
 *
 * Прежде отказ в действиях этапа, замечания и переписки уходил в общий
 * экран сбоя «Не удалось показать раздел»: человек не узнавал ни причины
 * («остановка без причины не принимается», «сообщение длиннее…»), ни того,
 * что данные не пропали (решение Р-242). Текст ограничен по длине: адрес
 * может прийти и не из формы кабинета.
 */
export default function ActionError({ text }: { text: string | undefined }) {
  if (text === undefined || text.trim() === '') return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <Notice tone="error" role="alert">
        {text.slice(0, 300)}
      </Notice>
    </div>
  );
}
