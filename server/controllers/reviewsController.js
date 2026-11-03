const { fn, col } = require("sequelize");
const { sequelize, Review, ReviewConsent } = require("../database");
const { getLegalDocuments } = require("../services/consentService");
const { HttpError } = require("../utils/http");

async function listPublic(_req, res) {
  const reviews = await Review.findAll({
    where: { status: "approved" },
    attributes: ["id", "name", "rating", "text", "createdAt"],
    include: [
      { model: ReviewConsent, as: "consent", attributes: ["publishName"], required: false },
    ],
    order: [["createdAt", "DESC"]],
  });
  res.json(
    reviews.map((review) => {
      const { consent, ...data } = review.get({ plain: true });
      // Старые опубликованные отзывы не меняем автоматически: их проверяет владелец.
      if (consent && !consent.publishName) data.name = "Гость";
      return data;
    }),
  );
}

async function stats(_req, res) {
  const result = await Review.findOne({
    attributes: [
      [fn("COUNT", col("id")), "count"],
      [fn("AVG", col("rating")), "average"],
    ],
    where: { status: "approved" },
    raw: true,
  });
  const count = Number(result.count);
  res.json({ count, average: count ? Math.round(Number(result.average) * 10) / 10 : null });
}

/** Атомарно сохраняет отзыв и копии документов, с которыми согласился посетитель. */
async function createPublic(req, res) {
  const result = await sequelize.transaction(async (transaction) => {
    const { texts, versions } = await getLegalDocuments(transaction);
    if (Object.keys(versions).some((key) => versions[key] !== req.body.versions[key])) {
      throw new HttpError(
        409,
        "Документы изменились. Ознакомьтесь с ними ещё раз и подтвердите согласия.",
      );
    }
    const review = await Review.create(
      { name: req.body.name, rating: req.body.rating, text: req.body.text, status: "pending" },
      { transaction },
    );
    await ReviewConsent.create(
      {
        reviewId: review.id,
        acceptedAt: new Date(),
        publishName: req.body.publishName === true,
        privacyText: texts.privacy,
        processingText: texts.processing,
        publicationText: texts.publication,
        privacyVersion: versions.privacy,
        processingVersion: versions.processing,
        publicationVersion: versions.publication,
      },
      { transaction },
    );
    return review;
  });
  res.status(201).json({ id: result.id, status: result.status });
}

async function listAdmin(_req, res) {
  res.json(
    await Review.findAll({
      order: [["createdAt", "DESC"]],
      include: [{ model: ReviewConsent, as: "consent", attributes: ["acceptedAt", "publishName"] }],
    }),
  );
}
async function consent(req, res) {
  const data = await ReviewConsent.findByPk(req.params.id);
  if (!data) throw new HttpError(404, "Для этого отзыва нет сохранённых сведений о согласиях.");
  res.json(data);
}
async function findReview(id) {
  const review = await Review.findByPk(id);
  if (!review) throw new HttpError(404, "Отзыв не найден.");
  return review;
}
async function moderate(req, res) {
  const review = await findReview(req.params.id);
  await review.update({ status: req.body.status });
  res.json({ id: review.id, status: review.status });
}
async function remove(req, res) {
  const review = await findReview(req.params.id);
  await review.destroy();
  res.json({ deleted: true });
}

module.exports = { listPublic, stats, createPublic, listAdmin, consent, moderate, remove };
