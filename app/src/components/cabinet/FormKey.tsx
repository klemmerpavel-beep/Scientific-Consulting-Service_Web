import { FORM_KEY_FIELD, newFormKey } from '../../lib/cabinet/form-key';

/**
 * Скрытое поле с одноразовым ключом формы (решение Р-934). Ставится в
 * формы, повторная отправка которых делала бы вторую запись о деньгах,
 * заказе или заявке.
 */
export default function FormKey() {
  return <input type="hidden" name={FORM_KEY_FIELD} value={newFormKey()} />;
}
