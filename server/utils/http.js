/** Передаёт ошибки асинхронного обработчика в общий обработчик Express 4.
 * @param {import("express").RequestHandler} handler Обработчик маршрута.
 * @returns {import("express").RequestHandler} Обработчик с передачей отказа Promise в next().
 */
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Создаёт ожидаемую ошибку API с безопасным сообщением для посетителя. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { asyncRoute, HttpError };
