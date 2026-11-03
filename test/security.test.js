const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD = "test-password-12345";
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = ":memory:";
process.env.TRUST_PROXY = "false";
const { app } = require("../server/app");
const { initDatabase, sequelize, Service, Review } = require("../server/database");
const { logEvent } = require("../server/services/logger");

test("сеансы, заголовки, запросы, XSS и загрузки защищены", async () => {
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (url, { token, data, ...options } = {}) =>
    fetch(base + url, {
      ...options,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...options.headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  try {
    const home = await request("/");
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("x-powered-by"), null);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.match(home.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.doesNotMatch(home.headers.get("content-security-policy"), /unsafe-inline|unsafe-eval/);
    assert.equal(home.headers.get("cache-control"), "no-store");
    const otherHome = await request("/");
    assert.notEqual(
      home.headers.get("content-security-policy"),
      otherHome.headers.get("content-security-policy"),
    );
    assert.equal(
      (
        await request("/api/services", { headers: { Origin: "https://untrusted.test" } })
      ).headers.get("access-control-allow-origin"),
      null,
    );
    assert.equal(
      (
        await request("/api/reviews", {
          method: "POST",
          data: {},
          headers: { Origin: "https://untrusted.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/admin/contacts", { headers: { Cookie: "token=pretend" } })).status,
      401,
    );
    assert.equal(
      (
        await request("/api/admin/masters/1/photo", {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: Buffer.alloc(50),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"broken":',
        })
      ).status,
      400,
    );
    assert.equal(
      (await request("/api/reviews", { method: "POST", data: { text: "x".repeat(20000) } })).status,
      413,
    );
    for (const url of [
      "/.env",
      "/server/app.js",
      "/data/hunter.sqlite",
      "/images/uploads/test.html",
      "/images/uploads/test.svg",
    ]) {
      const response = await request(url);
      assert([403, 404].includes(response.status), url);
      assert.doesNotMatch(await response.text(), /JWT_SECRET|ADMIN_PASSWORD|sqlite format/i);
    }
    const login = await request("/api/admin/login", {
      method: "POST",
      data: { login: "test-admin", password: "test-password-12345" },
    });
    const { token } = await login.json();
    assert.equal(login.status, 200);
    const payload = jwt.decode(token);
    assert.equal(payload.iss, "hunter");
    assert.equal(payload.aud, "hunter-admin");
    assert(payload.jti);
    assert.equal(payload.exp - payload.iat, 3600);
    assert.equal(
      (await request("/api/admin/contacts", { token })).headers.get("cache-control"),
      "no-store",
    );
    for (const invalidToken of [
      token + "x",
      jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { algorithm: "HS384" }),
      jwt.sign({ role: "admin", exp: 1 }, process.env.JWT_SECRET),
    ]) {
      assert.equal((await request("/api/admin/contacts", { token: invalidToken })).status, 401);
    }
    assert.equal(
      (
        await request("/api/admin/photos?category=work&category=atmosphere", {
          token,
          method: "POST",
          headers: { "Content-Type": "image/png" },
          body: Buffer.alloc(50),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request("/api/admin/photos?category=work", {
          token,
          method: "POST",
          headers: { "Content-Type": "image/svg+xml" },
          body: "<svg></svg>",
        })
      ).status,
      415,
    );
    assert.equal(
      (await request("/api/admin/services/1%20OR%201=1", { token, method: "DELETE" })).status,
      400,
    );
    const name = "' OR 1=1; -- $& $' $`";
    await Service.create({ name, category: "Проверка", price: 1000 });
    const schemaHtml = await (await request("/")).text();
    const schema = JSON.parse(
      schemaHtml.match(/<script[^>]+id="services-schema"[^>]*>([\s\S]*?)<\/script>/)[1],
    );
    assert.equal(schema["@graph"][0].name, name);
    const document = "1. Проверка\n<script>alert(1)</script> $& $' $` ";
    assert.equal(
      (await request("/api/admin/privacy", { token, method: "PUT", data: { text: document } }))
        .status,
      200,
    );
    const documentHtml = await (await request("/privacy")).text();
    assert.match(documentHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert(documentHtml.includes("$&amp; $&#39; $`"));
    const versions = await (await request("/api/legal/versions")).json();
    const review = {
      name: "Посетитель",
      rating: 5,
      text: "Попытка <img src=x onerror=alert(1)> и проверка обработки текста.",
      versions,
      privacyAcknowledged: true,
      processingConsent: true,
      publicationConsent: true,
    };
    const firstReview = await request("/api/reviews", { method: "POST", data: review });
    assert.equal(firstReview.status, 201);
    assert.equal((await Review.findOne()).status, "pending");
    assert.equal((await request("/api/reviews", { method: "POST", data: review })).status, 429);
    assert.equal((await request("/api/admin/logout", { token, method: "POST" })).status, 200);
    assert.equal((await request("/api/admin/contacts", { token })).status, 401);
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await request("/api/admin/login", {
            method: "POST",
            data: { login: "test-admin", password: "incorrect-password-123" },
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await request("/api/admin/login", {
          method: "POST",
          data: { login: "test-admin", password: "incorrect-password-123" },
          headers: { "X-Forwarded-For": "203.0.113.123" },
        })
      ).status,
      429,
    );
    const output = [];
    const originalLog = console.log;
    try {
      console.log = (value) => output.push(value);
      logEvent("test.redaction", {
        status: 400,
        password: "DO_NOT_LOG",
        token: "DO_NOT_LOG",
        body: "DO_NOT_LOG",
        query: "DO_NOT_LOG",
      });
    } finally {
      console.log = originalLog;
    }
    assert(!output.join("").includes("DO_NOT_LOG"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
});
