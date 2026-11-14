const { Master, Photo } = require("../database");
const { removeUploadedImage } = require("./photoStorage");
const { logEvent } = require("./logger");

/**
 * @file photoService.js
 * @description Сервис для работы с фотографиями.
 */

/** Удаляет файл только после удаления последней ссылки на него в базе.
 * @param {string} imagePath - путь к изображению.
 * @returns {Promise<void>}
 * Ошибка удаления записывается в журнал и не отменяет сохранённое изменение карточки.
 */
async function removeUnusedImage(imagePath) {
  if (
    !imagePath ||
    (await Master.count({ where: { photo: imagePath } })) ||
    (await Photo.count({ where: { path: imagePath } }))
  )
    return;
  try {
    await removeUploadedImage(imagePath);
  } catch (error) {
    logEvent("upload.cleanup_failed", { errorName: error.name, errorCode: error.code });
  }
}

module.exports = { removeUnusedImage };
