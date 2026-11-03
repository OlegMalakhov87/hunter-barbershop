const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD = "test-password-12345";
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
const { app } = require("../server/app");
const { sequelize, initDatabase, Service } = require("../server/database");

test("общая цена сохраняется, новые цены проверяются и попадают на сайт", async () => {
  await initDatabase();
  await Service.create({
    name: "Старая услуга",
    category: "Стрижки",
    description: "",
    price: 1200,
    isPopular: true,
    isActive: true,
  });
  await initDatabase(); // Повторный запуск не меняет цены и записи.
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = "GET", data, token) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      body: type.includes("application/json") ? await response.json() : await response.text(),
    };
  }
  try {
    let legacy = (await request("/api/services")).body[0];
    assert.equal(legacy.price, 1200);
    assert.equal(legacy.barberPrice, null);
    assert.equal(legacy.topBarberPrice, null);
    const login = await request("/api/admin/login", "POST", {
      login: "test-admin",
      password: "test-password-12345",
    });
    assert.equal(login.status, 200);
    const token = login.body.token;
    const payload = {
      name: "Старая услуга",
      category: "Стрижки",
      description: "",
      isPopular: true,
      isActive: true,
      barberPrice: null,
      topBarberPrice: null,
    };
    assert.equal((await request("/api/admin/services", "POST", payload, token)).status, 400);
    let saved = await request("/api/admin/services/" + legacy.id, "PUT", payload, token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.price, 1200);
    for (const bad of [-1, 1.5, 100001, "1300", true, [], {}])
      assert.equal(
        (
          await request(
            "/api/admin/services",
            "POST",
            { ...payload, barberPrice: bad, topBarberPrice: 1500 },
            token,
          )
        ).status,
        400,
      );
    saved = await request(
      "/api/admin/services/" + legacy.id,
      "PUT",
      { ...payload, barberPrice: 1300, topBarberPrice: 1500 },
      token,
    );
    assert.equal(saved.status, 200);
    assert.equal(saved.body.price, 1300);
    legacy = (await request("/api/services")).body[0];
    assert.equal(legacy.barberPrice, 1300);
    assert.equal(legacy.topBarberPrice, 1500);
    const html = (await request("/")).body;
    const match = html.match(/<script[^>]+id="services-schema"[^>]*>([\s\S]*?)<\/script>/);
    assert(match);
    const schema = JSON.parse(match[1]);
    assert.deepEqual(
      schema["@graph"][0].offers.map((x) => [x.name, x.price]),
      [
        ["Барбер", 1300],
        ["Топ-барбер", 1500],
      ],
    );
    assert.equal(
      (await request("/api/admin/services/" + legacy.id, "PUT", payload, token)).status,
      400,
    );
    saved = await request(
      "/api/admin/services/" + legacy.id,
      "PUT",
      { ...payload, barberPrice: null, topBarberPrice: 1500 },
      token,
    );
    assert.equal(saved.status, 200);
    assert.equal(saved.body.price, 1500);
    assert.equal(saved.body.barberPrice, null);
    saved = await request(
      "/api/admin/services/" + legacy.id,
      "PUT",
      { ...payload, barberPrice: 0, topBarberPrice: null },
      token,
    );
    assert.equal(saved.status, 200);
    assert.equal(saved.body.price, 0);
    assert.equal(saved.body.barberPrice, 0);
    assert.equal((await Service.findByPk(legacy.id)).barberPrice, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
