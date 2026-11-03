// Сохраняет прежний номер при обновлении базы и до первого сохранения контактов.
const DEFAULT_PHONE = "+79002225566";

/**
 * Возвращает номер для ссылки tel: или пустую строку при ошибке.
 * Российские номера из 10 цифр и номера через 8 приводятся к +7.
 * Международные номера принимаются с явным кодом страны после +.
 */
function normalizePhone(value) {
  if (typeof value !== "string" || value.length > 40) return "";
  const input = value.trim();
  if (!/^\+?[0-9 ()-]+$/.test(input)) return "";
  let digits = input.replace(/\D/g, "");
  if (!input.startsWith("+")) {
    if (digits.length === 10) digits = "7" + digits;
    else if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
    else if (!(digits.length === 11 && digits.startsWith("7"))) return "";
  }
  if (!/^[1-9][0-9]{7,14}$/.test(digits)) return "";
  if (digits.startsWith("7") && digits.length !== 11) return "";
  return "+" + digits;
}

/** Форматирует номер для чтения; остальные международные номера сохраняют вид +кодномер. */
function formatPhone(value) {
  const phone = normalizePhone(value);
  return phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 ($1) $2-$3-$4");
}

/** Возвращает сохранённый номер или прежний номер сайта для старой/пустой базы. */
function contactPhone(values) {
  return normalizePhone(values?.phone) || DEFAULT_PHONE;
}

module.exports = { DEFAULT_PHONE, normalizePhone, formatPhone, contactPhone };
