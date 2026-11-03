const { Master, Photo } = require("../database");
const { removeUploadedImage } = require("./photoStorage");
const { logEvent } = require("./logger");

/** Удаляет файл только после удаления последней ссылки на него в базе. */
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
