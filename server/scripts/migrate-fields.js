require("../config/runtime").assertNodeVersion();
const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Sequelize, Transaction } = require("sequelize");
const { defineModels } = require("../models");
const { resolveDatabaseStorage } = require("../config/storage");

/**
 * Добавляет поля из текущей модели, сохраняя записи и копию исходной базы.
 * Приложение и другие подключения к этому файлу должны быть остановлены.
 * Не переименовывает поля, не меняет типы, связи и содержимое существующих колонок.
 * @param {string} storage Абсолютный путь к существующему файлу SQLite.
 * @param {string} tableName Имя таблицы из models.js.
 * @param {string[]} fields Имена атрибутов модели, которые нужно добавить.
 * @returns {Promise<{changed: boolean, backup: string|null}>} Результат и путь к копии.
 */
async function migrateFields(storage, tableName, fields) {
  if (!path.isAbsolute(storage)) throw Error("Нужен абсолютный путь к существующей базе.");
  if (!(await fs.stat(storage)).isFile()) throw Error("Укажите файл существующей базы SQLite.");
  if (typeof tableName !== "string" || !Array.isArray(fields) || !fields.length) {
    throw Error("Укажите таблицу и хотя бы одно поле из модели.");
  }

  const connection = new Sequelize({ dialect: "sqlite", storage, logging: false });
  const models = defineModels(connection);
  let backup = null;
  let changed = false;
  try {
    const model = Object.values(models).find((entry) => entry.getTableName() === tableName);
    if (!model) throw Error("В models.js нет таблицы «" + tableName + "».");
    const attributes = [...new Set(fields)].map((name) => {
      if (typeof name !== "string" || !Object.hasOwn(model.rawAttributes, name)) {
        throw Error("Поле «" + name + "» не описано в модели таблицы «" + tableName + "».");
      }
      return model.rawAttributes[name];
    });
    const query = connection.getQueryInterface();

    await connection.transaction({ type: Transaction.TYPES.EXCLUSIVE }, async (transaction) => {
      const tables = await query.showAllTables({ transaction });
      if (!tables.includes(tableName)) throw Error("В базе нет таблицы «" + tableName + "».");
      const columns = await query.describeTable(tableName, { transaction });
      const missing = attributes.filter((attribute) => !columns[attribute.field]);
      if (!missing.length) return;

      // Проверяем весь набор до копирования и первой записи. Для сложных ограничений
      // и обязательных полей без значения нужна отдельная миграция с переносом данных.
      for (const attribute of missing) {
        const value = attribute.defaultValue;
        const constantDefault =
          value == null || ["string", "number", "boolean"].includes(typeof value);
        if (
          attribute.primaryKey ||
          attribute.autoIncrement ||
          attribute.unique ||
          attribute.references ||
          attribute.type.key === "VIRTUAL" ||
          !constantDefault ||
          (attribute.allowNull === false && value == null)
        ) {
          throw Error(
            "Поле «" +
              attribute.fieldName +
              "» нельзя добавить автоматически. " +
              "Нужна отдельная миграция: проверьте ограничения и заполнение существующих строк.",
          );
        }
      }

      // Файловая копия допустима только без неперенесённых записей в WAL.
      // WAL вручную не удаляем: иначе можно потерять подтверждённые изменения.
      const wal = await fs.stat(storage + "-wal").catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
      if (wal?.size) {
        throw Error("В базе есть WAL. Завершите подключения и сделайте штатную копию SQLite.");
      }
      backup = path.join(
        path.dirname(storage),
        "hunter-before-migrate-" + Date.now() + "-" + randomUUID() + ".sqlite",
      );
      await fs.copyFile(storage, backup, constants.COPYFILE_EXCL);
      await fs.chmod(backup, 0o600);
      for (const attribute of missing) {
        await query.addColumn(tableName, attribute.field, attribute, { transaction });
      }
      changed = true;
    });
    return { changed, backup };
  } finally {
    await connection.close();
  }
}

async function main() {
  const [tableName, ...fields] = process.argv.slice(2);
  const usage = "npm run db:migrate -- <таблица> <поле> [другое_поле]";
  if (tableName === "--help") {
    console.log(usage);
    return;
  }
  if (!tableName || !fields.length) throw Error(usage);
  // Изменение схемы не требует логина, пароля или JWT приложения.
  require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
  const result = await migrateFields(resolveDatabaseStorage(), tableName, fields);
  console.log(result.changed ? "Поля добавлены." : "Поля уже существуют. Изменений нет.");
  if (result.backup) console.log("Резервная копия:", result.backup);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Ошибка изменения схемы:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { migrateFields };
