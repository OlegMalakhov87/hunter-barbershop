const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
delete process.env.ADMIN_PASSWORD;
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
process.env.YCLIENTS_BOOKING_URL = "https://n12345.yclients.ru/?source=test";
const { app, bookingUrl, bookingWidget } = require("../server/app");
const { initDatabase, sequelize } = require("../server/database");

test("виджет использует только разрешённые адреса и подключается к странице", async () => {
  assert.throws(() => bookingUrl("https://user@yclients.ru/"));
  assert.throws(() => bookingUrl("https://yclients.ru:8443/"));
  assert.throws(() => bookingUrl("https://yclients.ru.evil.test/"));
  assert.equal(bookingWidget("https://yclients.ru/"), null);
  assert.equal(bookingWidget("https://n12345.yclients.ru/custom"), null);
  assert.equal(bookingWidget("https://n12345.yclients.ru/#other"), null);
  assert.deepEqual(bookingWidget("https://n12345.yclients.ru/?source=test"), {
    scriptOrigin: "https://w12345.yclients.ru",
    formOrigin: "https://n12345.yclients.ru",
    legacyOrigin: "https://b12345.yclients.ru",
  });
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    const response = await fetch(base + "/");
    const html = await response.text();
    const policy = response.headers.get("content-security-policy");
    assert.match(html, /data-booking-widget-script="https:\/\/w12345\.yclients\.ru\/widgetJS"/);
    assert.match(html, /data-booking-widget-url="https:\/\/n12345\.yclients\.ru\/\?source=test"/);
    assert.match(policy, /script-src[^;]*https:\/\/w12345\.yclients\.ru/);
    assert.match(policy, /frame-src[^;]*https:\/\/b12345\.yclients\.ru/);
    assert.match(policy, /font-src[^;]*https:\/\/w12345\.yclients\.ru/);
    assert.doesNotMatch(policy, /unsafe-inline/);
    const booking = await fetch(base + "/booking", { redirect: "manual" });
    assert.equal(booking.headers.get("location"), "https://n12345.yclients.ru/?source=test");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
