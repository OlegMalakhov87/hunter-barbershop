/** Передаёт ошибки асинхронного обработчика в общий обработчик Express 4. */
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
