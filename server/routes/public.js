const express = require("express");
const { rateLimit } = require("express-rate-limit");
const catalog = require("../controllers/publicController");
const reviews = require("../controllers/reviewsController");
const settings = require("../controllers/settingsController");
const { reviewRules, validate } = require("../middleware/validation");
const { asyncRoute } = require("../utils/http");

const router = express.Router();
const reviewLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 1,
  skipFailedRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Отзыв уже отправлен. Повторите позже." },
});
router.get("/services", asyncRoute(catalog.services));
router.get("/masters", asyncRoute(catalog.masters));
router.get("/photos", asyncRoute(catalog.photos));
router.get("/config", asyncRoute(catalog.config));
router.get("/reviews", asyncRoute(reviews.listPublic));
router.get("/reviews/stats", asyncRoute(reviews.stats));
router.get("/legal/versions", asyncRoute(settings.legalVersions));
router.post("/reviews", reviewLimit, reviewRules, validate, asyncRoute(reviews.createPublic));

module.exports = router;
