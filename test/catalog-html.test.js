const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
const { app } = require("../server/app");
const { initDatabase, sequelize, Service, Master } = require("../server/database");

test("прайс и мастера доступны сразу в HTML без запросов браузера к API", async () => {
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await Service.bulkCreate([
      {
        name: "Мужская стрижка",
        category: "Стрижки",
        price: 1300,
        barberPrice: 1300,
        topBarberPrice: 1500,
        isPopular: true,
      },
      { name: "Борода <script>alert(1)</script>", category: "Борода", price: 800 },
      { name: "Скрытая услуга", category: "Стрижки", price: 900, isActive: false },
    ]);
    await Master.bulkCreate([
      { name: "Иван <img src=x>", role: "Топ-барбер", photo: "/images/hunter-room.webp" },
      { name: "Пётр", role: "Барбер", photo: "https://other.example/photo.jpg" },
      { name: "Скрытый мастер", role: "Барбер", isActive: false },
    ]);
    const html = await (await fetch("http://127.0.0.1:" + server.address().port + "/")).text();
    assert.equal((html.match(/class="service-row"/g) || []).length, 2);
    assert.equal((html.match(/class="master-card"/g) || []).length, 2);
    assert.match(html, /Мужская стрижка/);
    assert.match(html, /Борода &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Иван &lt;img src=x&gt;/);
    assert.doesNotMatch(
      html,
      /Скрытая услуга|Скрытый мастер|Загружаем услуги|Загружаем мастеров|src="https:\/\/other/,
    );
    const graph = JSON.parse(html.match(/id="services-schema"[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.equal(graph["@graph"].length, 2);
    assert.match(html, /data-category="Стрижки" data-popular="true"/);
    assert.match(html, /id="hero-price-note">Мужская стрижка:/);
    const script = await (
      await fetch("http://127.0.0.1:" + server.address().port + "/js/site.js")
    ).text();
    assert.doesNotMatch(script, /fetch\("\/api\/(?:services|masters)"\)/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
