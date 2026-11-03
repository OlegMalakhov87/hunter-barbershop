const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const dotenv = require("dotenv");
const {
  hashPassword,
  verifyPassword,
  isPasswordHash,
} = require("../server/services/passwordService");
const { savePasswordHash, migratePassword } = require("../server/scripts/admin-password");

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

test("перевод .env в хеш сохраняет пароль, другие настройки и права файла", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-password-"));
  const file = path.join(directory, ".env");
  const password = "Проверка #$ пробелов 2026";
  const source = `# Настройки\r\nSITE_URL=http://localhost:3001\r\nADMIN_PASSWORD='${password}' # прежнее поле\r\nJWT_SECRET=unrelated-test-value\r\nADMIN_LOGIN=test-admin\r\nOTHER="keep # and $ sign"\r\n`;
  try {
    await fs.writeFile(file, source, { mode: 0o600 });
    assert.equal(await migratePassword(file), true);
    const result = await fs.readFile(file, "utf8");
    const values = dotenv.parse(result);
    assert.equal(Object.hasOwn(values, "ADMIN_PASSWORD"), false);
    assert.equal(await verifyPassword(password, values.ADMIN_PASSWORD_HASH), true);
    assert(!result.includes(password));
    assert(result.includes("JWT_SECRET=unrelated-test-value\r\n"));
    assert(result.includes('OTHER="keep # and $ sign"\r\n'));
    assert.equal(values.ADMIN_LOGIN, "test-admin");
    assert.equal(await migratePassword(file), false);
    assert.equal(await fs.readFile(file, "utf8"), result);
    if (process.platform !== "win32") assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    await assert.rejects(
      savePasswordHash(values.ADMIN_PASSWORD_HASH, file, "устаревшая копия"),
      /изменился/,
    );
    await assert.rejects(savePasswordHash("invalid", file), /формат/);
    assert.equal(await fs.readFile(file, "utf8"), result);
    assert.deepEqual(await fs.readdir(directory), [".env"]);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("несовпадающий старый пароль и хеш не перезаписывают настройки", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hunter-password-conflict-"));
  const file = path.join(directory, ".env");
  const source = `ADMIN_PASSWORD=another-password-2026\nADMIN_PASSWORD_HASH=${require("./fixtures/admin-password.json")}\n`;
  try {
    await fs.writeFile(file, source, { mode: 0o600 });
    await assert.rejects(migratePassword(file), /разные варианты/);
    assert.equal(await fs.readFile(file, "utf8"), source);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
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
