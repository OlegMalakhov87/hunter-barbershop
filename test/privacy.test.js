const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hunter-privacy-"));
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = path.join(temp, "privacy.sqlite");
const { app } = require("../server/app");
const { initDatabase, sequelize } = require("../server/database");

test("политика доступна всем, изменяется только администратором и безопасно отображает текст", async () => {
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = async (url, method = "GET", data, token) => {
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
      body: type.includes("application/json") ? await response.json() : await response.text(),
    };
  };
  try {
    const home = await request("/");
    assert.match(home.body, /href="\/privacy"/);
    assert.match((await request("/sitemap.xml")).body, /\/privacy/);
    const policy = await request("/privacy");
    assert.equal(policy.status, 200);
    assert.match(policy.body, /УКАЗАТЬ ФИО ИП/);
    assert.match(policy.body, /<h2>1\. Общие положения<\/h2>/);
    assert.doesNotMatch(policy.body, /shelter67|gord-natali/);
    assert.equal((await request("/api/admin/privacy")).status, 401);
    assert.equal(
      (
        await request("/api/admin/privacy", "PUT", {
          text: "Попытка изменения документа посторонним пользователем.",
        })
      ).status,
      401,
    );
    const login = await request("/api/admin/login", "POST", {
      login: "test-admin",
      password: "test-password-12345",
    });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.match(
      (await request("/api/admin/privacy", "GET", undefined, token)).body.text,
      /УКАЗАТЬ EMAIL/,
    );
    for (const text of [
      null,
      42,
      "",
      "мало",
      "а".repeat(12001),
      "Текст с запрещённым символом\u0000 посередине документа",
    ]) {
      assert.equal((await request("/api/admin/privacy", "PUT", { text }, token)).status, 400);
    }
    const edited =
      '1. Политика Hunter\nВажный текст <script>alert("XSS")</script> для теста.\n\n2. Обращения\nПример: name@example.ru';
    const saved = await request("/api/admin/privacy", "PUT", { text: edited }, token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.text, edited);
    const updated = await request("/privacy");
    assert.match(updated.body, /<h2>1\. Политика Hunter<\/h2>/);
    assert.match(updated.body, /&lt;script&gt;alert\(&quot;XSS&quot;\)&lt;\/script&gt;/);
    assert.doesNotMatch(updated.body, /<script>alert/);
    assert.doesNotMatch(updated.body, /contenteditable|<textarea/);
    const check = execFileSync(
      process.execPath,
      [
        "-e",
        `const {sequelize,PrivacyPolicy}=require('./server/database'); (async()=>{const p=await PrivacyPolicy.findByPk(1);console.log(JSON.stringify(p.text));await sequelize.close()})()`,
      ],
      { cwd: path.join(__dirname, ".."), env: process.env, encoding: "utf8" },
    );
    assert.equal(JSON.parse(check.trim()), edited);
    assert.equal((await request("/api/admin/privacy", "GET", undefined, token)).body.text, edited);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
