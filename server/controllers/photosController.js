const { Photo, Master } = require("../database");
const { saveImage, removeUploadedImage } = require("../services/photoStorage");
const { removeUnusedImage } = require("../services/photoService");
const { HttpError } = require("../utils/http");

/** Находит фото по id, если не найдено - выбрасывает ошибку.
 * @param {number} id - идентификатор фото.
 * @returns {Promise<Photo>} - найденное фото.
 * @throws {HttpError} - если фото не найдено.
 */
async function findPhoto(id) {
  const photo = await Photo.findByPk(id);
  if (!photo) throw new HttpError(404, "Фото не найдено.");
  return photo;
}

/** Возвращает список всех фото в порядке убывания id. */
async function list(_req, res) {
  res.json(await Photo.findAll({ order: [["id", "DESC"]] }));
}

/** Удаляет новый файл, если запись в базе не удалось сохранить. */
async function create(req, res) {
  const imagePath = await saveImage(req.body, req.get("content-type"), "gallery");
  try {
    const photo = await Photo.create({
      category: req.query.category,
      caption: req.query.caption ?? "",
      path: imagePath,
    });
    res.status(201).json(photo);
  } catch (error) {
    await removeUploadedImage(imagePath);
    throw error;
  }
}

/** Обновляет категорию и подпись фото. */
async function update(req, res) {
  const photo = await findPhoto(req.params.id);
  await photo.update({ category: req.body.category, caption: req.body.caption ?? "" });
  res.json(photo);
}

/** Заменяет фото на новое, обновляет категорию и подпись. */
async function replace(req, res) {
  const photo = await findPhoto(req.params.id);
  const newPath = await saveImage(req.body, req.get("content-type"), "gallery");
  const previousPath = photo.path;
  try {
    await photo.update({
      category: req.query.category,
      caption: req.query.caption ?? "",
      path: newPath,
    });
  } catch (error) {
    await removeUploadedImage(newPath);
    throw error;
  }
  await removeUnusedImage(previousPath);
  res.json(photo);
}

/** Удаляет фото из базы и удаляет файл с диска. */
async function remove(req, res) {
  const photo = await findPhoto(req.params.id);
  await photo.destroy();
  await removeUnusedImage(photo.path);
  res.json({ deleted: true });
}

/** Устанавливает фото мастера. */
async function setMasterPhoto(req, res) {
  const master = await Master.findByPk(req.params.id);
  if (!master) throw new HttpError(404, "Мастер не найден.");
  const newPath = await saveImage(req.body, req.get("content-type"), "master");
  const previousPath = master.photo;
  try {
    await master.update({ photo: newPath });
  } catch (error) {
    await removeUploadedImage(newPath);
    throw error;
  }
  await removeUnusedImage(previousPath);
  res.json({ id: master.id, photo: newPath });
}

module.exports = { list, create, update, replace, remove, setMasterPhoto };
