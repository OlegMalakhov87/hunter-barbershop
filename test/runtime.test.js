const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assertNodeVersion } = require("../server/config/runtime");

test("запуск принимает Node.js 24 и объясняет отказ для других версий", () => {
  for (const version of ["24.0.0", "24.22.2", "24.99.0"])
    assert.doesNotThrow(() => assertNodeVersion(version));
  for (const version of ["20.20.2", "22.0.0", "25.0.0", "26.0.0", "24.0.0-pre", "invalid"]) {
    assert.throws(() => assertNodeVersion(version), /Node\.js 24/);
  }
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "../server/config/runtime.js")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
