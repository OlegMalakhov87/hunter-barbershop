const { test } = require("node:test");
const assert = require("node:assert/strict");
const { publicLinks, normalizeContact } = require("../server/config/links");
const emptyLinks = { whatsappUrl: "", telegramUrl: "", vkUrl: "", maxUrl: "", instagramUrl: "" };

test("контакты принимают адреса мессенджеров и отклоняют посторонние домены", () => {
  const keys = [
    "WHATSAPP_URL",
    "TELEGRAM_URL",
    "VK_URL",
    "UTM_SOURCE",
    "UTM_MEDIUM",
    "UTM_CAMPAIGN",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.WHATSAPP_URL = "https://wa.me/79991234567";
    process.env.TELEGRAM_URL = "https://telegram.me/example";
    process.env.VK_URL = "https://vk.ru/example";
    assert.deepEqual(publicLinks(), emptyLinks);
    delete process.env.UTM_SOURCE;
    delete process.env.UTM_MEDIUM;
    delete process.env.UTM_CAMPAIGN;
    assert.deepEqual(
      publicLinks({
        whatsappUrl: process.env.WHATSAPP_URL,
        telegramUrl: process.env.TELEGRAM_URL,
        vkUrl: process.env.VK_URL,
      }),
      {
        ...emptyLinks,
        whatsappUrl: "https://wa.me/79991234567",
        telegramUrl: "https://telegram.me/example",
        vkUrl: "https://vk.ru/example",
      },
    );

    process.env.WHATSAPP_URL = "+7 (999) 123-45-67";
    process.env.TELEGRAM_URL = "https://telegram.me.example.com/steal";
    process.env.VK_URL = "javascript:alert(1)";
    assert.deepEqual(
      publicLinks({
        whatsappUrl: process.env.WHATSAPP_URL,
        telegramUrl: process.env.TELEGRAM_URL,
        vkUrl: process.env.VK_URL,
      }),
      emptyLinks,
    );

    process.env.WHATSAPP_URL = "https://wa.me/not-a-number";
    process.env.TELEGRAM_URL = "https://t.me:8443/example";
    process.env.VK_URL = "https://vk.ru.example.com/example";
    assert.deepEqual(
      publicLinks({
        whatsappUrl: process.env.WHATSAPP_URL,
        telegramUrl: process.env.TELEGRAM_URL,
        vkUrl: process.env.VK_URL,
      }),
      emptyLinks,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("новые контакты разрешают только свои HTTPS-домены и сохраняют полную ссылку", () => {
  for (const [field, allowed] of [
    ["maxUrl", ["https://max.ru/u/Token_aB-12?share=1#chat", "https://max.ru/hunter"]],
    ["instagramUrl", ["https://instagram.com/hunter/", "https://www.instagram.com/hunter/"]],
  ]) {
    for (const url of allowed) assert.equal(normalizeContact(field, url), url);
    const host = field === "maxUrl" ? "max.ru" : "instagram.com";
    for (const invalid of [
      `http://${host}/hunter`,
      `https://${host}.evil.test/hunter`,
      `https://evil.test/${host}`,
      `https://user@${host}/hunter`,
      `https://user:password@${host}/hunter`,
      `https://${host}:8443/hunter`,
      `//${host}/hunter`,
      "javascript:alert(1)",
      "data:text/html,test",
      null,
      [],
      {},
    ])
      assert.equal(normalizeContact(field, invalid), "");
  }
  assert.equal(normalizeContact("maxUrl", "https://t.me/hunter"), "");
  assert.equal(normalizeContact("instagramUrl", "https://max.ru/hunter"), "");
});
