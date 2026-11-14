/** Согласованные предельные сроки с момента отправки отзыва. 730 дней не превышают двух лет. */
const reviewRetention = Object.freeze({
  unpublishedDays: 30,
  publishedDays: 730,
  cleanupIntervalMs: 24 * 60 * 60 * 1000,
  batchSize: 100,
});

/** Подставляет те же сроки в исходные юридические тексты, которые использует очистка. */
function applyReviewRetention(text) {
  return text
    .replaceAll("__UNPUBLISHED_REVIEW_DAYS__", String(reviewRetention.unpublishedDays))
    .replaceAll("__PUBLISHED_REVIEW_DAYS__", String(reviewRetention.publishedDays));
}

module.exports = { reviewRetention, applyReviewRetention };
