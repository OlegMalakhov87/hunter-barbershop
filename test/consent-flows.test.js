const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
process.env.YANDEX_METRIKA_ID = "12345678";
const { app } = require("../server/app");
const { initDatabase, sequelize, Review, ReviewConsent } = require("../server/database");

test("документы, согласия посетителя и включение Метрики защищены и согласованы", async () => {
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  async function request(url, method = "GET", data, token) {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const type = response.headers.get("content-type") || "";
    return {
      status: response.status,
      body: type.includes("json") ? await response.json() : await response.text(),
    };
  }
  try {
    const home = await request("/");
    assert.match(home.body, /class="booking-dock"[\s\S]*?href="\/booking"/);
    assert.doesNotMatch(home.body, /id="chat-widget"|class="visit-photo"/);
    assert.match(home.body, /name="privacyAcknowledged"\s+required/);
    assert.match(home.body, /name="processingConsent"\s+required/);
    assert.match(home.body, /name="publicationConsent"\s+required/);
    assert.match(home.body, /privacy-consent\.js/);
    assert.doesNotMatch(home.body, /src="\/js\/metrics\.js"/);
    assert.doesNotMatch(home.body, /<iframe[^>]*src="https:\/\/yandex/);
    assert.match(home.body, /data-map-src="https:\/\/yandex/);
    assert.match(home.body, /name="fullName"/);
    assert.match(home.body, /name="phone"/);
    process.env.YANDEX_METRIKA_ID = "";
    assert.match((await request("/")).body, /privacy-consent\.js/);
    process.env.YANDEX_METRIKA_ID = "12345678";
    assert.doesNotMatch((await request("/admin")).body, /privacy-consent\.js/);
    assert.match((await request("/consent")).body, /УКАЗАТЬ ФИО ИП/);
    assert.match((await request("/publication-consent")).body, /Согласие на публикацию/);
    assert.equal((await request("/api/admin/consents/processing")).status, 401);
    assert.equal(
      (
        await request("/api/admin/consents/processing", "PUT", {
          text: "Изменение посторонним лицом длинного текста.",
        })
      ).status,
      401,
    );
    const login = await request("/api/admin/login", "POST", {
      login: "test-admin",
      password: "test-password-12345",
    });
    const token = login.body.token;
    assert.equal(login.status, 200);
    assert.equal(
      (await request("/api/admin/consents/unknown", "GET", undefined, token)).status,
      400,
    );
    assert.equal(
      (await request("/api/admin/consents/publication", "PUT", { text: "" }, token)).status,
      400,
    );
    const versions = (await request("/api/legal/versions")).body;
    const review = {
      name: "Тест",
      rating: 5,
      text: "Отличный мастер, спасибо за стрижку.",
      versions,
      privacyAcknowledged: true,
      fullName: "Иванов Иван Иванович",
      phone: "+7 (999) 765-43-21",
      processingConsent: true,
      publicationConsent: true,
    };
    for (const field of ["privacyAcknowledged", "processingConsent", "publicationConsent"]) {
      assert.equal(
        (await request("/api/reviews", "POST", { ...review, [field]: false })).status,
        400,
      );
    }
    assert.equal(
      (await request("/api/reviews", "POST", { ...review, processingConsent: "true" })).status,
      400,
    );
    assert.equal(
      (await request("/api/reviews", "POST", { ...review, publishName: "true" })).status,
      400,
    );
    for (const data of [
      { ...review, fullName: "Иван" },
      { ...review, fullName: null },
      { ...review, fullName: undefined },
      { ...review, phone: "+7" },
      { ...review, phone: "javascript:alert(1)" },
      { ...review, phone: undefined },
    ])
      assert.equal((await request("/api/reviews", "POST", data)).status, 400);
    const changed =
      "1. Новый текст\nТестовая версия согласия <script>alert(1)</script> на обработку персональных данных.";
    assert.equal(
      (await request("/api/admin/consents/processing", "PUT", { text: changed }, token)).status,
      200,
    );
    const displayed = await request("/consent");
    assert.match(displayed.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(displayed.body, /<script>alert\(1\)<\/script>/);
    assert.equal((await request("/api/reviews", "POST", review)).status, 409);
    assert.equal(await ReviewConsent.count(), 0);
    const current = (await request("/api/legal/versions")).body;
    const saved = await request("/api/reviews", "POST", {
      ...review,
      versions: current,
      publicationConditions: "Публиковать только на сайте барбершопа.",
    });
    assert.equal(saved.status, 201);
    const evidence = await ReviewConsent.findByPk(saved.body.id);
    assert.equal(evidence.processingText, changed);
    assert.equal(evidence.processingVersion, current.processing);
    assert.equal(evidence.publishName, false);
    assert.equal(evidence.phone, "+79997654321");
    assert.equal(evidence.fullName, "Иванов Иван Иванович");
    assert.equal(evidence.publicationConditions, "Публиковать только на сайте барбершопа.");
    assert.equal(
      (await request("/api/admin/reviews/" + saved.body.id, "PATCH", { status: "approved" }, token))
        .status,
      200,
    );
    const anonymous = (await request("/api/reviews")).body.find(
      (item) => item.id === saved.body.id,
    );
    assert.equal(anonymous.name, "Гость");
    assert.equal(anonymous.phone, undefined);
    assert.equal(anonymous.fullName, undefined);
    assert.equal(anonymous.consent, undefined);
    assert.equal(anonymous.publicationConditions, undefined);
    const namedReview = await Review.create({
      name: "Иван",
      rating: 5,
      text: "Тестовый отзыв о работе мастера.",
      status: "approved",
    });
    await ReviewConsent.create({
      reviewId: namedReview.id,
      acceptedAt: new Date(),
      publishName: true,
      privacyText: evidence.privacyText,
      processingText: evidence.processingText,
      publicationText: evidence.publicationText,
      privacyVersion: evidence.privacyVersion,
      processingVersion: evidence.processingVersion,
      publicationVersion: evidence.publicationVersion,
    });
    assert.equal(
      (await request("/api/reviews")).body.find((item) => item.id === namedReview.id).name,
      "Иван",
    );
    assert.equal((await request("/api/admin/reviews/" + saved.body.id + "/consent")).status, 401);
    assert.equal(
      (await request("/api/admin/reviews/" + saved.body.id + "/consent", "GET", undefined, token))
        .body.processingText,
      changed,
    );
    const adminReviews = await request("/api/admin/reviews", "GET", undefined, token);
    assert(adminReviews.body.some((item) => item.id === saved.body.id && item.consent));
    await request(
      "/api/admin/consents/processing",
      "PUT",
      { text: "1. Новая редакция\nИзменённый текст документа после сохранения отзыва." },
      token,
    );
    assert.equal((await ReviewConsent.findByPk(saved.body.id)).processingText, changed);
    assert.equal(
      (await request("/api/admin/reviews/" + saved.body.id, "DELETE", undefined, token)).status,
      200,
    );
    assert.equal(await ReviewConsent.findByPk(saved.body.id), null);
    assert.equal(await Review.count({ where: { id: saved.body.id } }), 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
