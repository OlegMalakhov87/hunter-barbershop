const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");

const uploadDirectory = path.join(__dirname, "..", "..", "client", "public", "images", "uploads");
const uploadedPath = /^\/images\/uploads\/[0-9a-f-]+\.(?:png|jpg|webp)$/;
const maxFileSize = 5 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const maxDimension = 1920;
let activeConversions = 0;
const maxConcurrentConversions = 2;

// Ограничиваем расход памяти и загрузку процессора на небольшом VPS.
sharp.cache({ memory: 32, files: 0, items: 64 });
sharp.concurrency(1);

class ImageValidationError extends Error {}
class ImageProcessingBusyError extends Error {}

/** Определяет формат по первым байтам файла, а не по его имени. */
function imageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return "";
}

/**
 * Проверяет содержимое фотографии и создаёт WebP без увеличения и обрезки.
 * Поворот по EXIF применяется до удаления метаданных, прозрачность сохраняется.
 * Большие изображения ограничены по числу пикселей, чтобы защитить сервер.
 */
async function convertToWebp(buffer, expectedExtension) {
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
    return await sharp(buffer, inputOptions)
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
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
 * @returns {Promise<string>} Локальный публичный путь /images/uploads/имя.webp.
 * @throws {ImageValidationError} Неподдерживаемый или повреждённый файл.
 * @throws {ImageProcessingBusyError} Все места обработки заняты.
 */
async function saveImage(buffer, contentType) {
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
    output = await convertToWebp(buffer, extension);
  } finally {
    activeConversions--;
  }
  await fs.mkdir(uploadDirectory, { recursive: true });
  const filename = randomUUID() + ".webp";
  await fs.writeFile(path.join(uploadDirectory, filename), output, { flag: "wx", mode: 0o600 });
  return "/images/uploads/" + filename;
}

/** Удаляет и старые загруженные файлы, и новые WebP. */
async function removeUploadedImage(imagePath) {
  if (!uploadedPath.test(imagePath || "")) return;
  try {
    await fs.unlink(path.join(uploadDirectory, path.basename(imagePath)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

module.exports = { saveImage, removeUploadedImage, ImageValidationError, ImageProcessingBusyError };
