const { Op, Transaction } = require("sequelize");
const { sequelize, Review } = require("../database");
const { reviewRetention } = require("../config/reviewRetention");
const { logEvent } = require("./logger");

/**
 * @file reviewRetentionService.js
 * @description Сервис для удаления просроченных отзывов и подтверждений согласия.
 */

const dayMs = 24 * 60 * 60 * 1000; // 1 день в миллисекундах

/**
 * Удаляет просроченные отзывы небольшими порциями вместе с подтверждениями согласия.
 * Дата отправки не меняется при модерации. Транзакция исключает удаление одновременно
 * подтверждаемого отзыва по прежнему статусу; содержимое записей в память не загружается.
 * @param {Date} now Момент проверки; задаётся явно в тестах.
 * @returns {Promise<number>} Количество удалённых отзывов.
 */
async function deleteExpiredReviews(now = new Date()) {
  const expired = {
    [Op.or]: [
      {
        status: { [Op.in]: ["pending", "rejected"] },
        createdAt: { [Op.lte]: new Date(now.getTime() - reviewRetention.unpublishedDays * dayMs) },
      },
      {
        status: "approved",
        createdAt: { [Op.lte]: new Date(now.getTime() - reviewRetention.publishedDays * dayMs) },
      },
    ],
  };
  let total = 0;
  for (;;) {
    const ids = await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const rows = await Review.findAll({
          attributes: ["id"],
          where: expired,
          order: [["id", "ASC"]],
          limit: reviewRetention.batchSize,
          raw: true,
          transaction,
        });
        if (!rows.length) return [];
        const reviewIds = rows.map((row) => row.id);
        await Review.destroy({ where: { id: { [Op.in]: reviewIds } }, transaction });
        return reviewIds;
      },
    );
    if (!ids.length) return total;
    total += ids.length;
    for (const reviewId of ids)
      logEvent("personal_data.review_expired", { actor: "system", reviewId });
  }
}

/** Функция которая запускает очистку отзывов без наложения запусков.
 *  Возвращает функцию остановки таймера.
 */
function startReviewCleanup() {
  let running = false;
  let stopped = false;
  let currentRun = Promise.resolve();
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    currentRun = deleteExpiredReviews()
      .catch((error) => {
        logEvent("review_cleanup.failed", { errorName: error.name, errorCode: error.code });
      })
      .finally(() => {
        running = false;
      });
  }, reviewRetention.cleanupIntervalMs);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await currentRun;
  };
}

module.exports = { deleteExpiredReviews, startReviewCleanup };
