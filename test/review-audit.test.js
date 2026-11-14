const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
const { app } = require("../server/app");
const { initDatabase, sequelize, Review, ReviewConsent } = require("../server/database");
const { logEvent } = require("../server/services/logger");

test("доступ к данным отзывов учитывается без записи закрытых сведений и токенов", async () => {
  await initDatabase();
  const privateName = "Проверочный Иван Иванович";
  const privatePhone = "+79991234567";
  const privateText = "Текст подтверждения не должен оказаться в журнале.";
  const review = await Review.create({
    name: "Закрытая подпись",
    rating: 5,
    text: privateText,
  });
  await ReviewConsent.create({
    reviewId: review.id,
    acceptedAt: new Date(),
    fullName: privateName,
    phone: privatePhone,
    publicationConditions: privateText,
    privacyText: privateText,
    processingText: privateText,
    publicationText: privateText,
    privacyVersion: "a".repeat(64),
    processingVersion: "b".repeat(64),
    publicationVersion: "c".repeat(64),
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const records = [];
  const previousLog = console.log;
  console.log = (message) => records.push(JSON.parse(message));
  const request = async (url, method = "GET", data, token) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request("/api/admin/reviews/" + review.id + "/consent")).status, 401);
    assert.equal(records.filter((record) => record.event.startsWith("personal_data.")).length, 0);
    const login = await request("/api/admin/login", "POST", {
      login: "test-admin",
      password: "test-password-12345",
    });
    const token = login.body.token;
    assert.equal(login.status, 200);
    assert.equal((await request("/api/admin/reviews", "GET", undefined, token)).status, 200);
    const proof = await request(
      "/api/admin/reviews/" + review.id + "/consent",
      "GET",
      undefined,
      token,
    );
    assert.equal(proof.status, 200);
    assert.equal(proof.body.phone, privatePhone);
    assert.equal(
      (await request("/api/admin/reviews/" + review.id, "PATCH", { status: "approved" }, token))
        .status,
      200,
    );
    assert.equal(
      (await request("/api/admin/reviews/" + review.id, "DELETE", undefined, token)).status,
      200,
    );
    assert.equal(await ReviewConsent.count(), 0);
    assert.equal(
      (await request("/api/admin/reviews/" + review.id + "/consent", "GET", undefined, token))
        .status,
      404,
    );
    const audit = records.filter((record) => record.event.startsWith("personal_data."));
    assert.deepEqual(
      audit.map((record) => [record.event, record.status]),
      [
        ["personal_data.reviews_listed", 200],
        ["personal_data.consent_read", 200],
        ["personal_data.review_moderated", 200],
        ["personal_data.review_deleted", 200],
        ["personal_data.consent_read", 404],
      ],
    );
    assert.equal(audit[0].reviewId, undefined);
    for (const record of audit) {
      assert.equal(record.actor, "admin");
      assert.match(record.requestId, /^[a-f0-9-]{36}$/);
      assert.equal(typeof record.time, "string");
      if (record.reviewId !== undefined) assert.equal(record.reviewId, review.id);
    }
    // Даже случайно переданные закрытые поля не проходят белый список журнала.
    logEvent("test.safe_fields", {
      requestId: "test-only",
      actor: "admin",
      reviewId: review.id,
      fullName: privateName,
      phone: privatePhone,
      text: privateText,
      token,
      password: "test-password-12345",
    });
    const output = JSON.stringify(records);
    for (const value of [privateName, privatePhone, privateText, token, "test-password-12345"])
      assert.equal(output.includes(value), false);
  } finally {
    console.log = previousLog;
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
