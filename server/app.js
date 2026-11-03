// Настройки читаются до моделей и маршрутов, чтобы .env действовал во всём приложении.
const environment = require("./config/environment");
const express = require("express");
const { initDatabase, sequelize, DatabaseSchemaError } = require("./database");
const { configureSecurity } = require("./middleware/security");
const { errorHandler } = require("./middleware/errors");
const { HttpError } = require("./utils/http");
const { logEvent } = require("./services/logger");
const { bookingUrl, bookingWidget } = require("./config/booking");
const metrics = require("./services/metricsService");

const app = express();
configureSecurity(app);
app.use(["/api/admin/privacy", "/api/admin/consents"], express.json({ limit: "96kb" }));
app.use(express.json({ limit: "16kb" }));

// Даже вручную попавшие в uploads HTML, SVG и скрипты не будут отданы браузеру.
app.use("/images/uploads", (req, _res, next) => {
  if (!/^\/[0-9a-f-]+\.(?:png|jpe?g|webp)$/i.test(req.path)) {
    return next(new HttpError(404, "Файл не найден."));
  }
  return next();
});
app.use(
  express.static(environment.publicDirectory, {
    maxAge: "1h",
    dotfiles: "deny",
    index: false,
    setHeaders(res, filePath) {
      if (/\.(?:css|js)$/.test(filePath)) res.setHeader("Cache-Control", "no-cache");
    },
  }),
);
app.get("/js/metrics.js", (_req, res) =>
  res.set("Cache-Control", "no-store").type("application/javascript").send(metrics.script()),
);
app.use("/api/admin", require("./routes/admin"));
app.use("/api", require("./routes/public"));
app.use(require("./routes/pages"));
app.get("/healthz", (_req, res) => res.set("Cache-Control", "no-store").json({ status: "ok" }));
app.use("/api", (_req, res) => res.status(404).json({ error: "Маршрут не найден." }));
app.use((_req, res) =>
  res
    .status(404)
    .type("html")
    .send(
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Страница не найдена</title><link rel="stylesheet" href="/css/style.css"><body class="error-page"><main class="container"><h1>Страница не найдена</h1><p>Проверьте адрес или вернитесь на главную.</p><a href="/">На главную</a></main></body></html>',
    ),
);
app.use(errorHandler);

/** Подключает базу перед приёмом запросов и ограничивает время медленных соединений. */
async function start() {
  await initDatabase();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(environment.port, environment.host, () => {
      listener.removeListener("error", reject);
      logEvent("server.started", { host: environment.host, port: environment.port });
      resolve(listener);
      console.log("Node.js:", process.version);
    });
    listener.once("error", reject);
  });
  server.headersTimeout = 15000;
  server.requestTimeout = 60000;
  server.keepAliveTimeout = 5000;
  return server;
}

if (require.main === module) {
  start()
    .then((server) => {
      let closing = false;
      const stop = () => {
        if (closing) return;
        closing = true;
        logEvent("server.stopping");
        const timeout = setTimeout(() => process.exit(1), 10000);
        timeout.unref();
        server.close(async () => {
          await sequelize.close();
          clearTimeout(timeout);
          process.exit(0);
        });
      };
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
    })
    .catch(async (error) => {
      logEvent("server.start_failed", { errorName: error.name, errorCode: error.code });
      console.error(
        error instanceof DatabaseSchemaError
          ? error.message
          : "Не удалось запустить Hunter. Проверьте настройки .env, доступ к базе и занятость порта.",
      );
      await sequelize.close();
      process.exitCode = 1;
    });
}

module.exports = { app, start, bookingUrl, bookingWidget };
