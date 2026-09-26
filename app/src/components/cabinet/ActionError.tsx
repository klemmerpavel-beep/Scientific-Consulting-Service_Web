import { flashText } from '../../lib/cabinet/flash';
import { Notice } from './ui';

/**
 * Отказ действия, переданный экрану адресом (`?error=`).
 *
 * Прежде отказ в действиях этапа, замечания и переписки уходил в общий
 * экран сбоя «Не удалось показать раздел»: человек не узнавал ни причины
 * («остановка без причины не принимается», «сообщение длиннее…»), ни того,
 * что данные не пропали (решение Р-242). В адресе — только метка: текст
 * берётся из одноразовой cookie того, чьё действие отказало, и чужая
 * ссылка ничего не выводит (решение Р-243).
 */
export default async function ActionError({ id }: { id: string | undefined }) {
  const text = await flashText(id);
  if (text === undefined || text.trim() === '') return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <Notice tone="error" role="alert">
        {text.slice(0, 300)}
      </Notice>
    </div>
  );
}
