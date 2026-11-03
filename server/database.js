const fs = require("node:fs/promises");
const path = require("node:path");
const { Sequelize } = require("sequelize");
const { defineModels } = require("./models");

const projectDirectory = path.resolve(__dirname, "..");
const configuredStorage = process.env.DB_STORAGE || "data/hunter.sqlite";
const storage =
  configuredStorage === ":memory:" ? ":memory:" : path.resolve(projectDirectory, configuredStorage);

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage,
  logging: false,
  pool: storage === ":memory:" ? { max: 1, min: 0, idle: 10000 } : undefined,
  retry: { max: 3 },
});
const models = defineModels(sequelize);

class DatabaseSchemaError extends Error {}

/**
 * Подключает существующий файл или создаёт отсутствующую базу и таблицы.
 * Миграций, удаления таблиц и автоматического заполнения примерами здесь нет.
 * Несовместимая старая схема вызывает понятную ошибку, сохраняя данные.
 * @returns {Promise<void>} Завершается после подключения и проверки схемы.
 * @throws {DatabaseSchemaError} В существующей таблице нет обязательных полей.
 */
async function initDatabase() {
  if (storage !== ":memory:") {
    await fs.mkdir(path.dirname(storage), { recursive: true, mode: 0o700 });
    try {
      const file = await fs.open(storage, "ax", 0o600);
      await file.close();
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  await sequelize.authenticate();
  const query = sequelize.getQueryInterface();
  const tables = new Set(await query.showAllTables());
  for (const model of Object.values(models)) {
    const table = model.getTableName();
    if (!tables.has(table)) continue;
    const columns = await query.describeTable(table);
    const missing = Object.keys(model.rawAttributes).filter((name) => !columns[name]);
    if (missing.length) {
      throw new DatabaseSchemaError(
        `База не соответствует текущей модели ${table}: отсутствуют ${missing.join(", ")}. Сохраните резервную копию и подключите актуальную базу. Автоматическое изменение схемы отключено.`,
      );
    }
  }
  // Обычный sync создаёт только отсутствующие таблицы. force и alter запрещены.
  await sequelize.sync();
}

module.exports = { sequelize, ...models, initDatabase, DatabaseSchemaError };
