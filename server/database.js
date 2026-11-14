const fs = require("node:fs/promises");
const path = require("node:path");
const { Sequelize } = require("sequelize");
const { defineModels } = require("./models");
const { resolveDatabaseStorage } = require("./config/storage");

const storage = resolveDatabaseStorage();

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
    const missing = Object.values(model.rawAttributes)
      .filter((attribute) => attribute.type.key !== "VIRTUAL" && !columns[attribute.field])
      .map((attribute) => attribute.fieldName);
    if (missing.length) {
      const hint = [
        "Схема базы данных не совпадает с кодом.",
        `При остановленном приложении выполните: npm run db:migrate -- ${table} ${missing.join(" ")}.`,
        "Команда добавляет только безопасные поля и сохраняет резервную копию.",
      ].join(" ");

      throw new DatabaseSchemaError(
        `Схема базы устарела. В таблице "${table}" отсутствуют поля: ${missing.join(", ")}. ` +
          `${hint} Автоматическое изменение схемы (sync({ alter: true })) отключено.`,
      );
    }
  }
  // Обычный sync создаёт только отсутствующие таблицы. force и alter запрещены.
  await sequelize.sync();
}

module.exports = { sequelize, ...models, initDatabase, DatabaseSchemaError };
