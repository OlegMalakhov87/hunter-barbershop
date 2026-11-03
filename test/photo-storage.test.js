const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");
const {
  saveImage,
  removeUploadedImage,
  ImageValidationError,
} = require("../server/services/photoStorage");
const uploadDir = path.join(__dirname, "..", "client", "public", "images", "uploads");
const read = (url) => fs.readFile(path.join(uploadDir, path.basename(url)));

test("загрузка превращает изображения в WebP, сохраняет прозрачность и ограничивает размер", async () => {
  const paths = [];
  try {
    const png = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 4,
        background: { r: 100, g: 60, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const image = await saveImage(png, "image/png");
    paths.push(image);
    assert.match(image, /^\/images\/uploads\/[0-9a-f-]+\.webp$/);
    const converted = await read(image);
    const metadata = await sharp(converted).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 960);
    assert.equal(metadata.hasAlpha, true);
    assert(converted.length < png.length, "Однотонное PNG должно стать меньше");
    assert.equal(metadata.exif, undefined);

    const small = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const rotated = await saveImage(small, "image/jpeg");
    paths.push(rotated);
    const rotatedMeta = await sharp(await read(rotated)).metadata();
    assert.equal(rotatedMeta.width, 20);
    assert.equal(rotatedMeta.height, 40);
    assert.equal(rotatedMeta.orientation, undefined);

    const originalWebp = await sharp({
      create: { width: 30, height: 15, channels: 3, background: "blue" },
    })
      .webp()
      .toBuffer();
    const webpPath = await saveImage(originalWebp, "image/webp");
    paths.push(webpPath);
    const webpMeta = await sharp(await read(webpPath)).metadata();
    assert.equal(webpMeta.format, "webp");
    assert.equal(webpMeta.width, 30);
    assert.equal(webpMeta.height, 15);
  } finally {
    await Promise.all(paths.map(removeUploadedImage));
  }
});

test("ошибочные и слишком большие изображения отклоняются; старые загрузки удаляются", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  await assert.rejects(saveImage(png, "image/jpeg"), ImageValidationError);
  await assert.rejects(
    saveImage(Buffer.concat([png.subarray(0, 8), Buffer.alloc(80)]), "image/png"),
    ImageValidationError,
  );
  await assert.rejects(
    saveImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"),
    ImageValidationError,
  );
  const oversized = await sharp({
    create: { width: 6400, height: 6300, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(saveImage(oversized, "image/png"), ImageValidationError);
  await fs.mkdir(uploadDir, { recursive: true });
  const oldName = randomUUID() + ".png";
  const oldPath = "/images/uploads/" + oldName;
  await fs.writeFile(path.join(uploadDir, oldName), png, { flag: "wx" });
  try {
    await removeUploadedImage(oldPath);
    await assert.rejects(fs.access(path.join(uploadDir, oldName)), { code: "ENOENT" });
  } finally {
    await fs.unlink(path.join(uploadDir, oldName)).catch(() => {});
  }
});
