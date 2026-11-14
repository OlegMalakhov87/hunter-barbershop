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
        height: 1800,
        channels: 4,
        background: { r: 100, g: 60, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const image = await saveImage(png, "image/png", "gallery");
    paths.push(image);
    assert.match(image, /^\/images\/uploads\/[0-9a-f-]+\.webp$/);
    const converted = await read(image);
    const metadata = await sharp(converted).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 1440);
    assert.equal(metadata.hasAlpha, true);
    assert(converted.length < png.length, "Однотонное PNG должно стать меньше");
    assert.equal(metadata.exif, undefined);

    const portrait = await sharp({
      create: { width: 1200, height: 960, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const rotated = await saveImage(portrait, "image/jpeg", "master");
    paths.push(rotated);
    const rotatedMeta = await sharp(await read(rotated)).metadata();
    assert.equal(rotatedMeta.width, 960);
    assert.equal(rotatedMeta.height, 1200);
    assert.equal(rotatedMeta.orientation, undefined);

    const originalWebp = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "blue" },
    })
      .webp()
      .toBuffer();
    const webpPath = await saveImage(originalWebp, "image/webp", "gallery");
    paths.push(webpPath);
    const webpMeta = await sharp(await read(webpPath)).metadata();
    assert.equal(webpMeta.format, "webp");
    assert.equal(webpMeta.width, 1200);
    assert.equal(webpMeta.height, 900);
  } finally {
    await Promise.all(paths.map(removeUploadedImage));
  }
});

test("ошибочные и слишком большие изображения отклоняются; старые загрузки удаляются", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  await assert.rejects(saveImage(png, "image/jpeg", "gallery"), ImageValidationError);
  await assert.rejects(
    saveImage(Buffer.concat([png.subarray(0, 8), Buffer.alloc(80)]), "image/png", "gallery"),
    ImageValidationError,
  );
  await assert.rejects(
    saveImage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png", "gallery"),
    ImageValidationError,
  );
  const oversized = await sharp({
    create: { width: 6400, height: 6300, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(saveImage(oversized, "image/png", "gallery"), ImageValidationError);
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

test("автоматическая обрезка даёт точные пропорции и сохраняет минимальное разрешение", async () => {
  const paths = [];
  const create = (width, height) =>
    sharp({ create: { width, height, channels: 3, background: "gray" } })
      .png()
      .toBuffer();
  try {
    for (const [kind, width, height, expectedWidth, expectedHeight] of [
      ["master", 720, 900, 720, 900],
      ["master", 735, 1045, 732, 915],
      ["master", 1200, 1200, 960, 1200],
      ["gallery", 900, 675, 900, 675],
      ["gallery", 900, 1200, 900, 675],
      ["gallery", 1600, 900, 1200, 900],
      ["gallery", 1201, 900, 1200, 900],
    ]) {
      const saved = await saveImage(await create(width, height), "image/png", kind);
      paths.push(saved);
      const metadata = await sharp(await read(saved)).metadata();
      assert.equal(metadata.width, expectedWidth);
      assert.equal(metadata.height, expectedHeight);
      assert(metadata.width <= width && metadata.height <= height, "Исходник не увеличивается");
    }
    for (const [kind, width, height] of [
      ["master", 680, 850],
      ["master", 720, 899],
      ["master", 600, 900],
      ["gallery", 800, 600],
      ["gallery", 899, 674],
      ["gallery", 900, 600],
    ]) {
      await assert.rejects(saveImage(await create(width, height), "image/png", kind), (error) => {
        assert(error instanceof ImageValidationError);
        assert.match(error.message, kind === "master" ? /4:5.*720 × 900/ : /4:3.*900 × 675/);
        assert(error.message.includes(`${width} × ${height}`));
        return true;
      });
    }
  } finally {
    await Promise.all(paths.map(removeUploadedImage));
  }
});

test("проверка размеров учитывает все EXIF-повороты с обменом сторон", async () => {
  const paths = [];
  try {
    for (const orientation of [5, 6, 7, 8]) {
      const jpeg = await sharp({
        create: { width: 1200, height: 960, channels: 3, background: "red" },
      })
        .jpeg()
        .withMetadata({ orientation })
        .toBuffer();
      const saved = await saveImage(jpeg, "image/jpeg", "master");
      paths.push(saved);
      const metadata = await sharp(await read(saved)).metadata();
      assert.equal(metadata.width, 960);
      assert.equal(metadata.height, 1200);
      assert.equal(metadata.orientation, undefined);
    }
  } finally {
    await Promise.all(paths.map(removeUploadedImage));
  }
});
