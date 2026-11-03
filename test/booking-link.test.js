const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD = "test-password-12345";
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
process.env.YCLIENTS_BOOKING_URL = "https://n12345.yclients.ru/";

const { app } = require("../server/app");

test("после настройки ссылки кнопка записи ведёт на сервис", async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/booking", {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://n12345.yclients.ru/");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
