const { Photo, Master } = require("../database");
const { saveImage, removeUploadedImage } = require("../services/photoStorage");
const { removeUnusedImage } = require("../services/photoService");
const { HttpError } = require("../utils/http");

async function findPhoto(id) {
  const photo = await Photo.findByPk(id);
  if (!photo) throw new HttpError(404, "Фото не найдено.");
  return photo;
}

async function list(_req, res) {
  res.json(await Photo.findAll({ order: [["id", "DESC"]] }));
}

/** Удаляет новый файл, если запись в базе не удалось сохранить. */
async function create(req, res) {
  const imagePath = await saveImage(req.body, req.get("content-type"));
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

async function update(req, res) {
  const photo = await findPhoto(req.params.id);
  await photo.update({ category: req.body.category, caption: req.body.caption ?? "" });
  res.json(photo);
}

async function replace(req, res) {
  const photo = await findPhoto(req.params.id);
  const newPath = await saveImage(req.body, req.get("content-type"));
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

async function remove(req, res) {
  const photo = await findPhoto(req.params.id);
  await photo.destroy();
  await removeUnusedImage(photo.path);
  res.json({ deleted: true });
}

async function setMasterPhoto(req, res) {
  const master = await Master.findByPk(req.params.id);
  if (!master) throw new HttpError(404, "Мастер не найден.");
  const newPath = await saveImage(req.body, req.get("content-type"));
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
