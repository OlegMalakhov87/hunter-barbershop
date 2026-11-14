const { logEvent } = require("../services/logger");

/**
 * Записывает результат админского обращения к данным отзыва без его содержимого.
 * Подключается после авторизации и проверки параметров. Для списка reviewId отсутствует.
 * @param {string} action Название действия, заданное разработчиком в маршруте.
 * @returns {Function} Обработчик Express, фиксирующий завершённый ответ.
 */
function auditReviewAction(action) {
  return (req, res, next) => {
    const actor = req.adminSession.sub;
    const reviewId = req.params.id;
    res.once("finish", () => {
      logEvent("personal_data." + action, {
        requestId: res.locals.requestId,
        actor,
        ...(Number.isInteger(reviewId) ? { reviewId } : {}),
        method: req.method,
        route: "/api/admin" + req.route.path,
        status: res.statusCode,
      });
    });
    next();
  };
}

module.exports = { auditReviewAction };
