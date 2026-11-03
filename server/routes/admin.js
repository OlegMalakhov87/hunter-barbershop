const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { body, query } = require("express-validator");
const auth = require("../controllers/authController");
const catalog = require("../controllers/catalogController");
const photos = require("../controllers/photosController");
const reviews = require("../controllers/reviewsController");
const settings = require("../controllers/settingsController");
const { requireAdmin } = require("../middleware/auth");
const { imageUpload } = require("../middleware/upload");
const { asyncRoute } = require("../utils/http");
const {
  loginRules,
  serviceRules,
  masterRules,
  pathId,
  validate,
  contactRules,
  legalText,
  consentKind,
  reviewStatus,
  photoRules,
} = require("../middleware/validation");

const router = express.Router();
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const loginLimit = rateLimit({
  windowMs: 30 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте через 30 минут." },
});
router.post("/login", loginLimit, loginRules, validate, asyncRoute(auth.login));

// Все операции ниже, включая загрузки и выход, требуют действующего сеанса.
router.use(requireAdmin);
router.post("/logout", auth.logout);
router.get("/privacy", asyncRoute(settings.privacy));
router.put("/privacy", legalText, validate, asyncRoute(settings.savePrivacy));
router.get("/consents/:kind", consentKind, validate, asyncRoute(settings.consent));
router.put("/consents/:kind", consentKind, legalText, validate, asyncRoute(settings.saveConsent));
router.get("/contacts", asyncRoute(settings.contacts));
router.put("/contacts", contactRules, validate, asyncRoute(settings.saveContacts));

for (const [path, controller, rules] of [
  ["services", catalog.services, serviceRules],
  ["masters", catalog.masters, masterRules],
]) {
  router.get(`/${path}`, asyncRoute(controller.list));
  router.post(`/${path}`, rules, validate, asyncRoute(controller.create));
  router.put(`/${path}/:id`, pathId, rules, validate, asyncRoute(controller.update));
  router.delete(`/${path}/:id`, pathId, validate, asyncRoute(controller.remove));
}
router.put("/masters/:id/photo", pathId, validate, imageUpload, asyncRoute(photos.setMasterPhoto));
router.get("/reviews", asyncRoute(reviews.listAdmin));
router.get("/reviews/:id/consent", pathId, validate, asyncRoute(reviews.consent));
router.patch("/reviews/:id", pathId, reviewStatus, validate, asyncRoute(reviews.moderate));
router.delete("/reviews/:id", pathId, validate, asyncRoute(reviews.remove));
router.get("/photos", asyncRoute(photos.list));
router.post("/photos", photoRules(query), validate, imageUpload, asyncRoute(photos.create));
router.put("/photos/:id", pathId, photoRules(body), validate, asyncRoute(photos.update));
router.put(
  "/photos/:id/file",
  pathId,
  photoRules(query),
  validate,
  imageUpload,
  asyncRoute(photos.replace),
);
router.delete("/photos/:id", pathId, validate, asyncRoute(photos.remove));

module.exports = router;
