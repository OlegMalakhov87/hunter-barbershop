const { randomUUID, randomBytes } = require("node:crypto");
const helmet = require("helmet");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const { siteUrl, trustProxy } = require("../config/environment");
const { widget } = require("../config/booking");
const { logEvent } = require("../services/logger");

/** Назначает внутренний номер запроса и пишет безопасный журнал изменений API. */
function requestContext(req, res, next) {
  res.locals.requestId = randomUUID();
  res.locals.nonce = randomBytes(16).toString("base64");
  res.set("X-Request-Id", res.locals.requestId);
  res.on("finish", () => {
    if (!req.originalUrl.startsWith("/api/") || (req.method === "GET" && res.statusCode < 400))
      return;
    const prefix = req.originalUrl.startsWith("/api/admin/") ? "/api/admin" : "/api";
    const route = typeof req.route?.path === "string" ? req.route.path : "/*";
    logEvent("api.request", {
      requestId: res.locals.requestId,
      method: req.method,
      route: prefix + route,
      status: res.statusCode,
    });
  });
  next();
}

/** Дополнительно отклоняет изменения с чужого сайта; Bearer-токен всё равно обязателен. */
function sameOriginWrites(req, res, next) {
  const origin = req.get("origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && origin && origin !== siteUrl.origin) {
    return res.status(403).json({ error: "Запрос с этого сайта запрещён." });
  }
  return next();
}

/** Устанавливает заголовки до раздачи страниц, API и загруженных изображений. */
function configureSecurity(app) {
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.set("query parser", "simple");
  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          scriptSrc: [
            "'self'",
            (_req, res) => `'nonce-${res.locals.nonce}'`,
            "https://mc.yandex.ru",
            ...(widget ? [widget.scriptOrigin, widget.formOrigin] : []),
          ],
          styleSrc: ["'self'", ...(widget ? [widget.scriptOrigin, widget.formOrigin] : [])],
          fontSrc: ["'self'", ...(widget ? [widget.scriptOrigin, widget.formOrigin] : [])],
          imgSrc: [
            "'self'",
            "data:",
            "blob:",
            "https://mc.yandex.ru",
            ...(widget ? [widget.scriptOrigin, widget.formOrigin] : []),
          ],
          connectSrc: [
            "'self'",
            "https://mc.yandex.ru",
            ...(widget ? [widget.scriptOrigin, widget.formOrigin] : []),
          ],
          frameSrc: [
            "https://yandex.ru",
            "https://yandex.com",
            ...(widget ? [widget.scriptOrigin, widget.formOrigin, widget.legacyOrigin] : []),
          ],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || origin === siteUrl.origin),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use("/api", sameOriginWrites);
  app.use(
    "/api",
    rateLimit({
      windowMs: 10 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Слишком много запросов. Подождите несколько минут." },
    }),
  );
}

module.exports = { configureSecurity };
