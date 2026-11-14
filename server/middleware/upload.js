const express = require("express");
const { rateLimit } = require("express-rate-limit");

const uploadLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много загрузок. Повторите позже." },
});
const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

function checkImageType(req, res, next) {
  if (!supportedTypes.includes(req.get("content-type"))) {
    return res.status(415).json({ error: "Выберите изображение PNG, JPEG или WebP." });
  }
  return next();
}

// Этот обработчик подключается в маршрутах только после requireAdmin.
const imageUpload = [
  uploadLimit,
  checkImageType,
  express.raw({ type: supportedTypes, limit: "5mb" }),
];
module.exports = { imageUpload };
