const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");
const {
  hashPassword,
  verifyPassword,
  isPasswordHash,
} = require("../server/services/passwordService");
const { savePasswordHash } = require("../server/scripts/admin-password");

test("scrypt использует разные соли и принимает только правильный пароль", async () => {
  const password = "Проверочный пароль 2026";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(isPasswordHash(first));
  assert(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + "!", first), false);
  assert.equal(await verifyPassword(password, second), true);
});

test("неверные хеши и произвольные параметры scrypt отклоняются", async () => {
  const fixture = require("./fixtures/admin-password.json");
  for (const hash of [
    undefined,
    null,
    {},
    "plain-password",
    fixture + "$extra",
    fixture.replace("32768", "1073741824"),
    fixture.slice(0, -2),
  ]) {
    assert.equal(isPasswordHash(hash), false);
    assert.equal(await verifyPassword("test-password-12345", hash), false);
  }
  for (const password of [null, {}, "short", "x".repeat(101)]) {
    await assert.rejects(hashPassword(password), /12.*100/);
    assert.equal(await verifyPassword(password, fixture), false);
  }
});

test("смена пароля атомарно сохраняет хеш, другие настройки и закрытые права файла", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-password-"));
  const file = path.join(directory, ".env");
  const hash = require("./fixtures/admin-password.json");
  const source =
    '# Настройки\r\nSITE_URL=http://localhost:3001\r\nADMIN_LOGIN=test-admin\r\nOTHER="keep # and $ sign"\r\nADMIN_PASSWORD_HASH=previous-value\r\n';
  try {
    await fs.writeFile(file, source, { mode: 0o600 });
    await savePasswordHash(hash, file);
    const result = await fs.readFile(file, "utf8");
    const values = dotenv.parse(result);
    assert.equal(values.ADMIN_PASSWORD_HASH, hash);
    assert.equal(values.ADMIN_LOGIN, "test-admin");
    assert.equal(values.OTHER, "keep # and $ sign");
    assert.equal(values.SITE_URL, "http://localhost:3001");
    assert.equal(result.match(/ADMIN_PASSWORD_HASH=/g).length, 1);
    assert(result.includes("\r\n"));
    await savePasswordHash(hash, file);
    assert.equal(await fs.readFile(file, "utf8"), result);
    await assert.rejects(savePasswordHash("invalid", file), /формат/);
    assert.equal(await fs.readFile(file, "utf8"), result);
    assert.deepEqual(await fs.readdir(directory), [".env"]);
    if (process.platform !== "win32") assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("команда пароля отклоняет неизвестные параметры без запроса и записи", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "../server/scripts/admin-password.js"), "--unknown"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Используйте npm run admin:password/);
  assert(!result.stdout.includes("Новый пароль"));
});

test("проверка входа ограничивает одновременные вычисления и освобождает места", async () => {
  process.env.ADMIN_LOGIN = "test-admin";
  process.env.ADMIN_PASSWORD_HASH = require("./fixtures/admin-password.json");
  process.env.JWT_SECRET = "test-only-secret-value-with-at-least-32-characters";
  const { issueToken } = require("../server/middleware/auth");
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, () => issueToken("test-admin", "test-password-12345")),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled" && typeof result.value === "string")
      .length,
    2,
  );
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.status, 503);
  assert.equal(await issueToken("wrong-admin", "test-password-12345"), null);
  assert.equal(await issueToken("test-admin", "another-password-2026"), null);
  assert.equal(typeof (await issueToken("test-admin", "test-password-12345")), "string");
});
