const { HttpError } = require("../utils/http");

/**
 * @file catalogService.js
 * @description Сервис для работы с каталогом услуг.
 */

/** Берёт только явно разрешённые поля, не копируя служебные поля модели из запроса.
 * @param {Object} body - объект с полями запроса.
 * @param {string[]} fields - массив разрешённых полей.
 * @returns {Object} - объект с разрешёнными полями.
 */
function pickFields(body, fields) {
  return Object.fromEntries(
    fields.filter((name) => Object.hasOwn(body, name)).map((name) => [name, body[name]]),
  );
}

/** Общая цена нужна для действующих услуг, у которых ещё не заполнены цены категорий.
 * @param {Object} values - объект с полями услуги, включая цены категорий.
 * @param {Object} previous - предыдущая версия услуги, если есть.
 * @returns {Object} - объект с полями услуги, включая общую цену.
 * @throws {HttpError} - если не указана цена хотя бы для одной категории мастеров.
 */
function prepareServicePrices(values, previous) {
  const barberPrice = values.barberPrice ?? null;
  const topBarberPrice = values.topBarberPrice ?? null;
  const prices = [barberPrice, topBarberPrice].filter((price) => price !== null);
  if (!prices.length) {
    if (!previous || previous.barberPrice !== null || previous.topBarberPrice !== null) {
      throw new HttpError(400, "Укажите цену хотя бы для одной категории мастеров.");
    }
    values.price = previous.price;
  } else values.price = Math.min(...prices);
  return { ...values, barberPrice, topBarberPrice };
}

/** Возвращает одинаковые цены для карточек, первого экрана и поисковой разметки.
 * @param {Object} service Услуга с отдельными ценами или общей ценой.
 * @returns {Array<[string, number]>} Подпись категории и цена; общая цена без подписи.
 */
function servicePrices(service) {
  const prices = [
    ["Барбер", service.barberPrice],
    ["Топ-барбер", service.topBarberPrice],
  ].filter(([, price]) => price != null);
  if (!prices.length && service.price != null) prices.push(["", service.price]);
  return prices;
}

module.exports = { pickFields, prepareServicePrices, servicePrices };
