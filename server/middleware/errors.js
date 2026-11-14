const { HttpError } = require("../utils/http");
const { ImageValidationError, ImageProcessingBusyError } = require("../services/photoStorage");
const { logEvent } = require("../services/logger");

/** Возвращает ожидаемые ошибки без SQL, путей к файлам, тела запроса и стека. */
function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let message = "Внутренняя ошибка сервера.";
  if (error instanceof HttpError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof ImageProcessingBusyError) {
    status = 429;
    message = "Сейчас обрабатываются другие фото. Повторите загрузку через несколько секунд.";
  } else if (error instanceof ImageValidationError) {
    status = 400;
    message = error.message;
  } else if (error.type === "entity.too.large" || error.status === 413) {
    status = 413;
    message = "Запрос слишком большой. Фото должно быть не больше 5 МБ.";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Неверный формат JSON.";
  } else if (["encoding.unsupported", "charset.unsupported"].includes(error.type)) {
    status = 415;
    message = "Формат запроса не поддерживается.";
  } else if (
    [
      "SequelizeValidationError",
      "SequelizeUniqueConstraintError",
      "SequelizeForeignKeyConstraintError",
    ].includes(error.name)
  ) {
    status = 400;
    message = "Проверьте переданные данные.";
  } else if (error.original?.code === "SQLITE_BUSY") {
    status = 503;
    message = "База временно занята. Повторите запрос.";
  }
  if (status >= 500)
    logEvent("request.failed", {
      requestId: res.locals.requestId,
      errorName: error.name,
      errorCode: error.code || error.original?.code,
      status,
    });
  if (req.path.startsWith("/api/"))
    return res.status(status).json({ error: message, requestId: res.locals.requestId });
  return res.status(status).type("text/plain").send(message);
}

module.exports = { errorHandler };
