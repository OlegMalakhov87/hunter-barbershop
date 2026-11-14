const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");

process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
process.env.TRUST_PROXY = "false";
const { app } = require("../server/app");
const { initDatabase, sequelize, Master, Photo } = require("../server/database");
const { removeUploadedImage } = require("../server/services/photoStorage");
const { imageRequirements } = require("../server/config/images");
const publicDir = path.join(__dirname, "..", "client", "public");

test("API проверяет новые фото и замены, сохраняет прежний файл при отказе и отдаёт правила админке", async () => {
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const paths = new Set();
  let token;
  const request = async (url, { data, ...options } = {}) => {
    const response = await fetch(base + url, {
      ...options,
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const png = (width, height) =>
    sharp({ create: { width, height, channels: 3, background: "gray" } })
      .png()
      .toBuffer();
  try {
    const html = await (await fetch(base + "/admin")).text();
    assert(!/__\w+_IMAGE_(RULES|HINT)__/.test(html));
    for (const [kind, id] of [
      ["master", "master-photo-file"],
      ["gallery", "photo-file"],
    ]) {
      const attribute = html.match(new RegExp(`id="${id}"[\\s\\S]*?data-image-rules="([^"]+)"`))[1];
      const rules = JSON.parse(attribute.replaceAll("&quot;", '"'));
      assert.equal(rules.minWidth, imageRequirements[kind].minWidth);
      assert.equal(rules.minHeight, imageRequirements[kind].minHeight);
      assert.equal(rules.maxDimension, 1920);
      assert.match(rules.hint, /пикселей/);
    }
    const login = await request("/api/admin/login", {
      method: "POST",
      data: { login: "test-admin", password: "test-password-12345" },
    });
    assert.equal(login.status, 200);
    token = login.body.token;
    const gallery = await png(900, 675);
    const portrait = await png(735, 1045);
    const small = await png(800, 600);
    const upload = (url, body, method = "POST") =>
      request(url, { method, headers: { "Content-Type": "image/png" }, body });
    const master = await Master.create({ name: "Тестовый мастер", role: "Барбер" });
    const masterUrl = `/api/admin/masters/${master.id}/photo`;
    const wrongPortrait = await upload(masterUrl, gallery, "PUT");
    assert.equal(wrongPortrait.status, 400);
    assert.match(wrongPortrait.body.error, /4:5/);
    assert.equal((await master.reload()).photo, "");
    const savedPortrait = await upload(masterUrl, portrait, "PUT");
    assert.equal(savedPortrait.status, 200);
    paths.add(savedPortrait.body.photo);
    const savedFile = await fs.readFile(path.join(publicDir, savedPortrait.body.photo));
    const savedMetadata = await sharp(savedFile).metadata();
    assert.equal(savedMetadata.format, "webp");
    assert.equal(savedMetadata.width, 732);
    assert.equal(savedMetadata.height, 915);
    const servedPortrait = await fetch(base + savedPortrait.body.photo);
    assert.equal(servedPortrait.status, 200);
    assert.match(servedPortrait.headers.get("content-type"), /^image\/webp/);
    assert.deepEqual(Buffer.from(await servedPortrait.arrayBuffer()), savedFile);
    const rejectedReplacement = await upload(masterUrl, small, "PUT");
    assert.equal(rejectedReplacement.status, 400);
    assert.equal((await master.reload()).photo, savedPortrait.body.photo);
    await fs.access(path.join(publicDir, master.photo));

    for (const category of ["work", "atmosphere"]) {
      const galleryInput = category === "work" ? gallery : await png(1200, 1200);
      const before = await Photo.count();
      assert.equal((await upload(`/api/admin/photos?category=${category}`, portrait)).status, 400);
      assert.equal(await Photo.count(), before);
      const created = await upload(`/api/admin/photos?category=${category}`, galleryInput);
      assert.equal(created.status, 201);
      paths.add(created.body.path);
      const galleryFile = await fs.readFile(path.join(publicDir, created.body.path));
      const galleryMetadata = await sharp(galleryFile).metadata();
      assert.equal(galleryMetadata.format, "webp");
      assert.equal(galleryMetadata.width, category === "work" ? 900 : 1200);
      assert.equal(galleryMetadata.height, category === "work" ? 675 : 900);
      const id = created.body.id;
      const replacement = await upload(
        `/api/admin/photos/${id}/file?category=${category}`,
        small,
        "PUT",
      );
      assert.equal(replacement.status, 400);
      assert.equal((await Photo.findByPk(id)).path, created.body.path);
      await fs.access(path.join(publicDir, created.body.path));
      const updated = await upload(
        `/api/admin/photos/${id}/file?category=${category}`,
        gallery,
        "PUT",
      );
      assert.equal(updated.status, 200);
      paths.add(updated.body.path);
      assert.notEqual(updated.body.path, created.body.path);
      await assert.rejects(fs.access(path.join(publicDir, created.body.path)), { code: "ENOENT" });
    }

    // Старое небольшое фото не блокирует изменение описания без нового файла.
    const legacyPath = "/images/uploads/" + randomUUID() + ".png";
    paths.add(legacyPath);
    await fs.writeFile(path.join(publicDir, legacyPath), await png(40, 30), { flag: "wx" });
    const legacy = await Photo.create({ category: "work", path: legacyPath });
    const edited = await request(`/api/admin/photos/${legacy.id}`, {
      method: "PUT",
      data: { category: "atmosphere", caption: "Новое описание" },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.path, legacyPath);
    assert.equal(edited.body.caption, "Новое описание");
  } finally {
    await Promise.all([...paths].map(removeUploadedImage));
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
