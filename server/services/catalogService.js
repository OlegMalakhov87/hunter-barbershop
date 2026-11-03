const { HttpError } = require("../utils/http");

/** Берёт только явно разрешённые поля, не копируя служебные поля модели из запроса. */
function pickFields(body, fields) {
  return Object.fromEntries(
    fields.filter((name) => Object.hasOwn(body, name)).map((name) => [name, body[name]]),
  );
}

/** Общая цена нужна для действующих услуг, у которых ещё не заполнены цены категорий. */
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

module.exports = { pickFields, prepareServicePrices };
