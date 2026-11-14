const { test } = require("node:test");
const assert = require("node:assert/strict");

process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
const { initDatabase, sequelize, Review, ReviewConsent } = require("../server/database");
const {
  deleteExpiredReviews,
  startReviewCleanup,
} = require("../server/services/reviewRetentionService");
const { reviewRetention } = require("../server/config/reviewRetention");
const { getLegalDocuments } = require("../server/services/consentService");

test("сроки отзывов удаляют только просроченные записи и связанные подтверждения", async (t) => {
  await initDatabase();
  const now = new Date("2026-11-11T12:00:00Z");
  const dayMs = 24 * 60 * 60 * 1000;
  const created = (days, extraMs = 0) => new Date(now.getTime() - days * dayMs + extraMs);
  const previousLog = console.log;
  const records = [];
  console.log = (message) => records.push(JSON.parse(message));
  try {
    const { texts } = await getLegalDocuments();
    for (const text of Object.values(texts)) {
      assert.match(text, /730/);
      assert.doesNotMatch(text, /__UNPUBLISHED_REVIEW_DAYS__|__PUBLISHED_REVIEW_DAYS__/);
    }
    assert.match(texts.privacy, /30 дней/);
    assert.match(texts.processing, /30 дней/);
    const rows = await Review.bulkCreate([
      { name: "Новый отзыв", rating: 5, text: "Сохраняется", status: "pending", createdAt: now },
      {
        name: "Почти 30 дней",
        rating: 5,
        text: "Сохраняется",
        status: "pending",
        createdAt: created(30, 1),
      },
      {
        name: "Ровно 30 дней",
        rating: 5,
        text: "Удаляется",
        status: "pending",
        createdAt: created(30),
      },
      {
        name: "Старый отклонённый",
        rating: 5,
        text: "Удаляется",
        status: "rejected",
        createdAt: created(31),
      },
      {
        name: "Опубликован 31 день",
        rating: 5,
        text: "Сохраняется",
        status: "approved",
        createdAt: created(31),
      },
      {
        name: "Почти 730 дней",
        rating: 5,
        text: "Сохраняется",
        status: "approved",
        createdAt: created(730, 1),
      },
      {
        name: "Ровно 730 дней",
        rating: 5,
        text: "Удаляется",
        status: "approved",
        createdAt: created(730),
      },
      {
        name: "Недавно модерирован",
        rating: 5,
        text: "Удаляется",
        status: "approved",
        createdAt: created(731),
        updatedAt: now,
      },
    ]);
    const privateName = "Проверочный Иван Иванович";
    const privatePhone = "+79991234567";
    await ReviewConsent.bulkCreate(
      rows.map((row) => ({
        reviewId: row.id,
        acceptedAt: row.createdAt,
        fullName: privateName,
        phone: privatePhone,
        privacyText: "Снимок документа",
        processingText: "Снимок документа",
        publicationText: "Снимок документа",
        privacyVersion: "a".repeat(64),
        processingVersion: "b".repeat(64),
        publicationVersion: "c".repeat(64),
      })),
    );
    const staleCount = reviewRetention.batchSize + 1;
    await Review.bulkCreate(
      Array.from({ length: staleCount }, () => ({
        name: "Старая запись без согласия",
        rating: 5,
        text: "Тест нескольких порций очистки",
        status: "pending",
        createdAt: created(31),
      })),
    );
    assert.equal(await deleteExpiredReviews(now), 4 + staleCount);
    const keep = [rows[0].id, rows[1].id, rows[4].id, rows[5].id];
    assert.deepEqual(
      (await Review.findAll({ attributes: ["id"], order: [["id", "ASC"]], raw: true })).map(
        (row) => row.id,
      ),
      keep,
    );
    assert.deepEqual(
      (
        await ReviewConsent.findAll({
          attributes: ["reviewId"],
          order: [["reviewId", "ASC"]],
          raw: true,
        })
      ).map((row) => row.reviewId),
      keep,
    );
    assert.equal((await ReviewConsent.findByPk(keep[0])).privacyText, "Снимок документа");
    assert.equal(await deleteExpiredReviews(now), 0);
    const deleted = records.filter((record) => record.event === "personal_data.review_expired");
    assert.equal(deleted.length, 4 + staleCount);
    assert(
      deleted.every((record) => record.actor === "system" && Number.isInteger(record.reviewId)),
    );
    assert.equal(JSON.stringify(deleted).includes(privateName), false);
    assert.equal(JSON.stringify(deleted).includes(privatePhone), false);
    // Продвигаем часы вместо ожидания реального часа и проверяем запуск по расписанию.
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now: now.getTime() });
    const stop = startReviewCleanup();
    t.mock.timers.tick(reviewRetention.cleanupIntervalMs);
    await stop();
    await stop();
    assert.deepEqual(
      (await Review.findAll({ attributes: ["id"], order: [["id", "ASC"]], raw: true })).map(
        (row) => row.id,
      ),
      [rows[0].id, rows[4].id],
    );
    assert.equal(await ReviewConsent.count(), 2);
  } finally {
    t.mock.timers.reset();
    console.log = previousLog;
    await sequelize.close();
  }
});
