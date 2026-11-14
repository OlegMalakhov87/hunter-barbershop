const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";

const { app } = require("../server/app");
const { initDatabase, sequelize, Review } = require("../server/database");

test("статистика учитывает все опубликованные отзывы и не считает скрытые", async () => {
  await initDatabase();
  await Review.destroy({ where: {} });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const stats = async () => (await fetch(base + "/api/reviews/stats")).json();

  try {
    assert.deepEqual(await stats(), { count: 0, average: null });
    await Review.bulkCreate(
      Array.from({ length: 55 }, (_, index) => ({
        name: `Гость ${index}`,
        rating: index < 28 ? 5 : 3,
        text: "Тестовый отзыв для проверки статистики.",
        status: "approved",
      })),
    );
    await Review.bulkCreate([
      { name: "На проверке", rating: 1, text: "Ожидающий отзыв.", status: "pending" },
      { name: "Отклонён", rating: 1, text: "Скрытый отзыв.", status: "rejected" },
    ]);
    assert.deepEqual(await stats(), { count: 55, average: 4 });
    assert.equal((await (await fetch(base + "/api/reviews")).json()).length, 55);
    const first = await Review.findOne({ where: { status: "approved", rating: 5 } });
    await first.update({ rating: 1 });
    assert.deepEqual(await stats(), { count: 55, average: 3.9 });
    await first.update({ status: "rejected" });
    assert.equal((await stats()).count, 54);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
