const path = require("node:path");

/** Возвращает один и тот же путь к базе для приложения и команды изменения схемы. */
function resolveDatabaseStorage(value = process.env.DB_STORAGE || "data/hunter.sqlite") {
  return value === ":memory:" ? value : path.resolve(__dirname, "../..", value);
}

module.exports = { resolveDatabaseStorage };
