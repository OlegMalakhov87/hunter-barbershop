const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { DataTypes } = require("sequelize");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hunter-lifecycle-"));
process.env.DB_STORAGE = path.join(directory, "hunter.sqlite");
const {
  sequelize,
  initDatabase,
  Service,
  Master,
  Review,
  ContactSettings,
  DatabaseSchemaError,
} = require("../server/database");

test("новая база пустая, повторный запуск и другой процесс сохраняют данные", async () => {
  try {
    await initDatabase();
    assert(fs.existsSync(process.env.DB_STORAGE));
    for (const Model of [Service, Master, Review]) assert.equal(await Model.count(), 0);
    if (process.platform !== "win32")
      assert.equal(fs.statSync(process.env.DB_STORAGE).mode & 0o777, 0o600);
    const service = await Service.create({
      name: "Проверка сохранности",
      category: "Стрижки",
      price: 1300,
      barberPrice: 1300,
    });
    await ContactSettings.create({ id: 1, phone: "+79991234567" });
    const restart = execFileSync(
      process.execPath,
      [
        "-e",
        `const {initDatabase,sequelize,Service,ContactSettings}=require('./server/database');(async()=>{await initDatabase();console.log(JSON.stringify({services:await Service.count(),phone:(await ContactSettings.findByPk(1)).phone}));await sequelize.close()})().catch(e=>{console.error(e.name);process.exit(1)})`,
      ],
      { cwd: path.join(__dirname, ".."), env: process.env, encoding: "utf8" },
    );
    assert.deepEqual(JSON.parse(restart.trim()), { services: 1, phone: "+79991234567" });
    assert.equal((await Service.findByPk(service.id)).price, 1300);
    await service.destroy();
    await initDatabase();
    assert.equal(await Service.count(), 0); // Удалённые записи не появляются вновь.
    const query = sequelize.getQueryInterface();
    await query.dropTable("photos");
    await query.createTable("photos", {
      id: { type: DataTypes.INTEGER, primaryKey: true },
      caption: DataTypes.TEXT,
    });
    await query.bulkInsert("photos", [{ id: 123, caption: "Существующая запись" }]);
    await assert.rejects(initDatabase(), DatabaseSchemaError);
    const columns = await query.describeTable("photos");
    assert.equal(columns.category, undefined); // Несовместимая таблица не исправляется миграцией.
    assert.equal(await query.rawSelect("photos", { where: { id: 123 } }, "id"), 123);
  } finally {
    await sequelize.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
