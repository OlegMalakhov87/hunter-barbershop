const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");
const { imageRequirements, maxImageDimension } = require("../config/images");

/**
 * @file photoStorage.js
 * @description Сервис для хранения фотографий.
 */

const uploadDirectory = path.join(__dirname, "..", "..", "client", "public", "images", "uploads");
const uploadedPath = /^\/images\/uploads\/[0-9a-f-]+\.(?:png|jpg|webp)$/;
const maxFileSize = 5 * 1024 * 1024;
const maxInputPixels = 40_000_000;
let activeConversions = 0;
const maxConcurrentConversions = 2;

// Ограничиваем расход памяти и загрузку процессора на небольшом VPS.
sharp.cache({ memory: 32, files: 0, items: 64 });
sharp.concurrency(1);

class ImageValidationError extends Error {}
class ImageProcessingBusyError extends Error {}

/** Вычисляет размер кадра нужных пропорций, не увеличивая исходную фотографию.
 * @param {sharp.Metadata} metadata - метаданные исходного изображения.
 * @param {Object} requirements - требования к кадру.
 * @param {number} requirements.ratioWidth - ширина пропорции.
 * @param {number} requirements.ratioHeight - высота пропорции.
 * @param {number} requirements.minWidth - минимальная ширина кадра.
 * @param {number} requirements.minHeight - минимальная высота кадра.
 * @returns {{width: number, height: number}} - размеры кадра.
 * @throws {ImageValidationError} - если исходное изображение слишком маленькое.
 */
function cropDimensions(metadata, requirements) {
  // EXIF 5–8 меняет местами ширину и высоту при последующем rotate().
  const swapped = [5, 6, 7, 8].includes(metadata.orientation);
  const width = swapped ? metadata.height : metadata.width;
  const height = swapped ? metadata.width : metadata.height;
  const { ratioWidth, ratioHeight, minWidth, minHeight } = requirements;
  // Целый множитель даёт точные 4:5 или 4:3 даже у фото с нечётными размерами.
  const scale = Math.floor(
    Math.min(
      width / ratioWidth,
      height / ratioHeight,
      maxImageDimension / Math.max(ratioWidth, ratioHeight),
    ),
  );
  const outputWidth = ratioWidth * scale;
  const outputHeight = ratioHeight * scale;
  if (outputWidth < minWidth || outputHeight < minHeight) {
    throw new ImageValidationError(
      `После обрезки ${ratioWidth}:${ratioHeight} получится ${outputWidth} × ${outputHeight} пикселей, нужно не менее ${minWidth} × ${minHeight}. Исходник: ${width} × ${height}. Выберите более крупное фото.`,
    );
  }
  return { width: outputWidth, height: outputHeight };
}

/** Определяет формат по первым байтам файла, а не по его имени.
 * @param {Buffer} buffer - первые байты файла.
 * @returns {"png"|"jpg"|"webp"|""} - расширение формата или пустая строка.
 */
function imageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return "";
}

/**
 * Проверяет фотографию, обрезает под формат раздела и создаёт WebP без увеличения.
 * Поворот по EXIF применяется до удаления метаданных, прозрачность сохраняется.
 * Большие изображения ограничены по числу пикселей, чтобы защитить сервер.
 * @param {Buffer} buffer - содержимое файла.
 * @param {string} expectedExtension - ожидаемое расширение: "png", "jpg" или "webp".
 * @param {Object} requirements - требования к кадру.
 * @param {number} requirements.ratioWidth - ширина пропорции.
 * @param {number} requirements.ratioHeight - высота пропорции.
 * @param {number} requirements.minWidth - минимальная ширина кадра.
 * @param {number} requirements.minHeight - минимальная высота кадра.
 * @returns {Promise<Buffer>} - содержимое WebP.
 * @throws {ImageValidationError} - если исходный файл не подходит.
 * @throws {ImageProcessingBusyError} - если все места обработки заняты.
 */
async function convertToWebp(buffer, expectedExtension, requirements) {
  try {
    const inputOptions = { limitInputPixels: maxInputPixels, failOn: "warning", animated: true };
    const metadata = await sharp(buffer, inputOptions).metadata();
    const expectedFormat = expectedExtension === "jpg" ? "jpeg" : expectedExtension;
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height) {
      throw new ImageValidationError("Неверный формат изображения.");
    }
    if ((metadata.pages || 1) > 1) {
      throw new ImageValidationError(
        "Анимированные изображения не поддерживаются. Выберите обычную фотографию.",
      );
    }
    const dimensions = cropDimensions(metadata, requirements);
    return await sharp(buffer, inputOptions)
      .rotate()
      .resize({
        ...dimensions,
        fit: "cover",
        // Штатный алгоритм Sharp выбирает область с деталями и оттенками кожи.
        position: sharp.strategy.attention,
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError(
      "Не удалось обработать изображение. Проверьте файл и его размер.",
    );
  }
}

/**
 * Сохраняет проверенную фотографию как WebP со случайным именем.
 * @param {Buffer} buffer Содержимое файла, ограниченное загрузчиком по размеру.
 * @param {string} contentType MIME-тип, который должен совпасть с сигнатурой.
 * @param {"master"|"gallery"} kind Раздел, определяющий пропорции и минимальный размер.
 * @returns {Promise<string>} Локальный публичный путь /images/uploads/имя.webp.
 * @throws {ImageValidationError} Неподдерживаемый или повреждённый файл.
 * @throws {ImageProcessingBusyError} Все места обработки заняты.
 */
async function saveImage(buffer, contentType, kind) {
  const requirements = imageRequirements[kind];
  if (!requirements) throw new TypeError("Неизвестный раздел для загрузки фотографии.");
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    throw new ImageValidationError("Выберите изображение PNG, JPEG или WebP.");
  }
  if (buffer.length > maxFileSize) {
    throw new ImageValidationError("Файл слишком большой (до 5 МБ).");
  }
  const extension = imageExtension(buffer);
  const expectedType = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" }[extension];
  if (!expectedType || contentType !== expectedType) {
    throw new ImageValidationError("Неверный формат изображения.");
  }
  if (activeConversions >= maxConcurrentConversions) throw new ImageProcessingBusyError();
  let output;
  activeConversions++;
  try {
    output = await convertToWebp(buffer, extension, requirements);
  } finally {
    activeConversions--;
  }
  await fs.mkdir(uploadDirectory, { recursive: true });
  const filename = randomUUID() + ".webp";
  await fs.writeFile(path.join(uploadDirectory, filename), output, { flag: "wx", mode: 0o600 });
  return "/images/uploads/" + filename;
}

/** Удаляет и старые загруженные файлы, и новые WebP.
 * @param {string} imagePath - путь к изображению.
 * @returns {Promise<void>}
 * @throws {Error} - если не удалось удалить файл.
 */
async function removeUploadedImage(imagePath) {
  if (!uploadedPath.test(imagePath || "")) return;
  try {
    await fs.unlink(path.join(uploadDirectory, path.basename(imagePath)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = { saveImage, removeUploadedImage, ImageValidationError, ImageProcessingBusyError };
