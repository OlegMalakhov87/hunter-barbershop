const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Sequelize } = require("sequelize");
const { defineModels } = require("../server/models");
const { migrateFields } = require("../server/scripts/migrate-fields");
const { resolveDatabaseStorage } = require("../server/config/storage");

test("общая команда добавляет поля разных таблиц и сохраняет восстанавливаемую копию", async (t) => {
  for (const fixture of [
    {
      model: "ReviewConsent",
      table: "review_consents",
      fields: ["fullName", "phone", "publicationConditions"],
      values: {},
    },
    {
      model: "Master",
      table: "masters",
      fields: ["description", "isActive"],
      values: { description: "", isActive: true },
    },
    {
      model: "ContactSettings",
      table: "contact_settings",
      fields: ["telegramUrl", "vkUrl"],
      values: { telegramUrl: "", vkUrl: "" },
    },
  ]) {
    await t.test(fixture.table, async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-schema-"));
      const storage = path.join(directory, "hunter.sqlite");
      const old = new Sequelize({ dialect: "sqlite", storage, logging: false });
      const oldModels = defineModels(old);
      for (const field of fixture.fields) oldModels[fixture.model].removeAttribute(field);
      await old.sync();
      const master = await oldModels.Master.create({ name: "Тестовый мастер", role: "Барбер" });
      const review = await oldModels.Review.create({
        name: "Гость",
        rating: 5,
        text: "Содержимое базы.",
        status: "approved",
      });
      await oldModels.ContactSettings.create({ id: 1, phone: "+79156548842" });
      await oldModels.ReviewConsent.create({
        reviewId: review.id,
        acceptedAt: new Date(),
        publishName: false,
        privacyText: "Политика",
        processingText: "Обработка",
        publicationText: "Публикация",
        privacyVersion: "a".repeat(64),
        processingVersion: "b".repeat(64),
        publicationVersion: "c".repeat(64),
      });
      await old.close();
      let current;
      let backup;
      try {
        const result = await migrateFields(storage, fixture.table, [
          ...fixture.fields,
          fixture.fields[0],
        ]);
        assert.equal(result.changed, true);
        assert(result.backup);
        current = new Sequelize({ dialect: "sqlite", storage, logging: false });
        const models = defineModels(current);
        assert.equal((await models.Master.findByPk(master.id)).name, "Тестовый мастер");
        assert.equal((await models.Review.findByPk(review.id)).text, "Содержимое базы.");
        const id =
          fixture.model === "Master"
            ? master.id
            : fixture.model === "ReviewConsent"
              ? review.id
              : 1;
        const saved = await models[fixture.model].findByPk(id);
        for (const field of fixture.fields)
          assert.equal(saved[field], fixture.values[field] ?? null);
        assert.equal((await models.ReviewConsent.findByPk(review.id)).privacyText, "Политика");
        await current.close();
        current = null;
        assert.deepEqual(await migrateFields(storage, fixture.table, fixture.fields), {
          changed: false,
          backup: null,
        });
        backup = new Sequelize({ dialect: "sqlite", storage: result.backup, logging: false });
        const columns = await backup.getQueryInterface().describeTable(fixture.table);
        for (const field of fixture.fields) assert.equal(columns[field], undefined);
        assert.equal(await defineModels(backup).Master.count(), 1);
        if (process.platform !== "win32")
          assert.equal((await fs.stat(result.backup)).mode & 0o777, 0o600);
        assert.equal(
          (await fs.readdir(directory)).filter((name) => name.startsWith("hunter-before-")).length,
          1,
        );
      } finally {
        await current?.close();
        await backup?.close();
        await fs.rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test("ошибка в наборе полей не меняет схему, записи и не создаёт лишнюю копию", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-invalid-schema-"));
  const storage = path.join(directory, "hunter.sqlite");
  const old = new Sequelize({ dialect: "sqlite", storage, logging: false });
  const { Master } = defineModels(old);
  Master.removeAttribute("description");
  Master.removeAttribute("name");
  await Master.sync();
  await Master.create({ role: "Барбер" });
  await old.close();
  let verification;
  try {
    await assert.rejects(
      migrateFields(storage, "masters", ["description", "unknown"]),
      /не описано/,
    );
    await assert.rejects(
      migrateFields(storage, "masters", ["description", "name"]),
      /отдельная миграция/,
    );
    await assert.rejects(migrateFields(storage, "unknown", ["name"]), /нет таблицы/);
    await assert.rejects(migrateFields(storage, "photos", ["caption"]), /нет таблицы/);
    await assert.rejects(migrateFields(storage, "masters", []), /хотя бы одно поле/);
    await assert.rejects(migrateFields(":memory:", "masters", ["description"]), /абсолютный путь/);
    assert.deepEqual(await fs.readdir(directory), ["hunter.sqlite"]);
    verification = new Sequelize({ dialect: "sqlite", storage, logging: false });
    const columns = await verification.getQueryInterface().describeTable("masters");
    assert.equal(columns.description, undefined);
    assert.equal(columns.name, undefined);
    assert.equal(await defineModels(verification).Master.count(), 1);
  } finally {
    await verification?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("команда работает без настроек входа, использует DB_STORAGE и не создаёт отсутствующую базу", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-schema-cli-"));
  const storage = path.join(directory, "existing.sqlite");
  const old = new Sequelize({ dialect: "sqlite", storage, logging: false });
  const { Master } = defineModels(old);
  Master.removeAttribute("description");
  await Master.sync();
  await Master.create({ name: "Тест", role: "Барбер" });
  await old.close();
  const env = { ...process.env, DB_STORAGE: storage };
  for (const field of ["SITE_URL", "ADMIN_LOGIN", "ADMIN_PASSWORD_HASH", "JWT_SECRET"])
    delete env[field];
  const script = path.resolve(__dirname, "../server/scripts/migrate-fields.js");
  try {
    const run = spawnSync(process.execPath, [script, "masters", "description"], {
      env,
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Поля добавлены/);
    const repeat = spawnSync(process.execPath, [script, "masters", "description"], {
      env,
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.match(repeat.stdout, /Изменений нет/);
    const missing = path.join(directory, "missing.sqlite");
    const failed = spawnSync(process.execPath, [script, "masters", "description"], {
      env: { ...env, DB_STORAGE: missing },
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(failed.status, 1);
    await assert.rejects(fs.access(missing), { code: "ENOENT" });
    assert.equal(resolveDatabaseStorage(":memory:"), ":memory:");
    assert.equal(
      resolveDatabaseStorage("data/test.sqlite"),
      path.resolve(__dirname, "../data/test.sqlite"),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
