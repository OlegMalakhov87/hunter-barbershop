const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hunter-contacts-"));
process.env.SITE_URL = "http://localhost:3001";
process.env.ADMIN_LOGIN = "test-admin";
process.env.ADMIN_PASSWORD = "test-password-12345";
process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
process.env.DB_STORAGE = path.join(temp, "contacts.sqlite");
delete process.env.UTM_SOURCE;
const { app } = require("../server/app");
const { initDatabase, sequelize, ContactSettings } = require("../server/database");

test("телефон и ссылки сохраняются между запусками без изменения схемы", async () => {
  await initDatabase();
  await ContactSettings.create({
    id: 1,
    phone: "+79002225566",
    whatsappUrl: "",
    telegramUrl: "https://t.me/keptcontact",
    vkUrl: "https://vk.ru/keptcontact",
  });
  await initDatabase();
  assert.equal(await ContactSettings.count(), 1);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = "GET", data, token) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const initial = {
      whatsappUrl: "",
      telegramUrl: "https://t.me/keptcontact",
      vkUrl: "https://vk.ru/keptcontact",
      maxUrl: "",
      instagramUrl: "",
      phone: "+79002225566",
    };
    assert.deepEqual((await request("/api/config")).body, {
      ...initial,
      phoneDisplay: "+7 (900) 222-55-66",
    });
    assert.equal((await request("/api/admin/contacts")).status, 401);
    assert.equal((await request("/api/admin/contacts", "PUT", initial)).status, 401);
    const login = await request("/api/admin/login", "POST", {
      login: "test-admin",
      password: "test-password-12345",
    });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.deepEqual((await request("/api/admin/contacts", "GET", undefined, token)).body, initial);
    for (const invalid of [
      { ...initial, telegramUrl: "https://t.me.evil.test/steal" },
      { ...initial, vkUrl: "javascript:alert(1)" },
      { ...initial, whatsappUrl: "https://wa.me/no-number" },
      { ...initial, vkUrl: ["https://vk.ru/test"] },
      { ...initial, telegramUrl: "https://t.me:8443/test" },
      { ...initial, telegramUrl: "x".repeat(2049) },
      ...["maxUrl", "instagramUrl"].flatMap((field) =>
        [null, [], {}, false, 123, "x".repeat(2049)].map((value) => ({
          ...initial,
          [field]: value,
        })),
      ),
      { ...initial, maxUrl: "https://max.ru.evil.test/u/contact" },
      { ...initial, maxUrl: "http://max.ru/u/contact" },
      { ...initial, maxUrl: "https://user:password@max.ru/u/contact" },
      { ...initial, maxUrl: "https://max.ru:8443/u/contact" },
      { ...initial, instagramUrl: "javascript:alert(1)" },
      { ...initial, instagramUrl: "https://instagram.com.evil.test/contact" },
      { ...initial, instagramUrl: "http://instagram.com/contact" },
      { phone: initial.phone, vkUrl: "https://vk.ru/test" },
      ...[
        undefined,
        null,
        true,
        79997654321,
        [],
        {},
        "",
        "123",
        "+712345678901",
        "tel:+79997654321",
        "<script>alert(1)</script>",
      ].map((phone) => ({ ...initial, phone })),
    ])
      assert.equal((await request("/api/admin/contacts", "PUT", invalid, token)).status, 400);
    assert.deepEqual((await request("/api/admin/contacts", "GET", undefined, token)).body, initial);

    const changed = {
      whatsappUrl: "",
      telegramUrl: "https://t.me/newcontact",
      vkUrl: "https://vk.com/newcontact",
      maxUrl: "https://max.ru/u/Contact_aB-123?share=1",
      instagramUrl: "https://www.instagram.com/hunter_test/",
      phone: "+79997654321",
    };
    assert.deepEqual(
      (
        await request(
          "/api/admin/contacts",
          "PUT",
          { ...changed, phone: "8 (999) 765-43-21" },
          token,
        )
      ).body,
      changed,
    );
    assert.deepEqual((await request("/api/config")).body, {
      ...changed,
      phoneDisplay: "+7 (999) 765-43-21",
    });
    assert.deepEqual((await request("/api/admin/contacts", "GET", undefined, token)).body, changed);

    // Обновление из старой открытой вкладки не стирает новые контакты.
    const { maxUrl, instagramUrl, ...legacyFields } = changed;
    assert.deepEqual(
      (await request("/api/admin/contacts", "PUT", legacyFields, token)).body,
      changed,
    );

    const html = await (await fetch(base + "/")).text();
    assert.equal((html.match(/href="tel:\+79997654321"/g) || []).length, 3);
    assert.equal(
      (html.match(/<span\b[^>]*data-phone-text[^>]*>\+7 \(999\) 765-43-21<\/span>/g) || []).length,
      2,
    );
    const schema = JSON.parse(
      html.match(/<script[^>]+id="business-schema"[^>]*>([\s\S]*?)<\/script>/)[1],
    );
    assert.equal(schema.telephone, changed.phone);
    assert.doesNotMatch(html, /href="tel:\+79002225566"/);

    const child = execFileSync(
      process.execPath,
      [
        "-e",
        `const {sequelize,ContactSettings}=require('./server/database');(async()=>{await sequelize.authenticate();const s=await ContactSettings.findByPk(1,{raw:true});console.log(JSON.stringify({whatsappUrl:s.whatsappUrl,telegramUrl:s.telegramUrl,vkUrl:s.vkUrl,maxUrl:s.maxUrl,instagramUrl:s.instagramUrl,phone:s.phone}));await sequelize.close()})()`,
      ],
      { cwd: path.join(__dirname, ".."), env: process.env, encoding: "utf8" },
    );
    assert.deepEqual(JSON.parse(child.trim()), changed);

    process.env.UTM_SOURCE = "phone-test";
    const tagged = (await request("/api/config")).body;
    assert.equal(tagged.phone, changed.phone);
    assert.match(tagged.telegramUrl, /utm_source=phone-test/);
    assert.match(tagged.maxUrl, /share=1&utm_source=phone-test/);
    assert.match(tagged.instagramUrl, /utm_source=phone-test/);
    delete process.env.UTM_SOURCE;
    const blankLinks = {
      whatsappUrl: "",
      telegramUrl: "",
      vkUrl: "",
      maxUrl: "",
      instagramUrl: "",
      phone: changed.phone,
    };
    assert.deepEqual(
      (await request("/api/admin/contacts", "PUT", blankLinks, token)).body,
      blankLinks,
    );
    assert.deepEqual((await request("/api/config")).body, {
      ...blankLinks,
      phoneDisplay: "+7 (999) 765-43-21",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
