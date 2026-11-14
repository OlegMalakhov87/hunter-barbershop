const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePhone,
  formatPhone,
  contactPhone,
  DEFAULT_PHONE,
} = require("../server/config/phone");

test("телефоны нормализуются для звонка, а неверные значения отклоняются", () => {
  for (const value of ["+7 (999) 765-43-21", "8 (999) 765-43-21", "79997654321", "9997654321"]) {
    assert.equal(normalizePhone(value), "+79997654321");
  }
  assert.equal(formatPhone("+79997654321"), "+7 (999) 765-43-21");
  assert.equal(normalizePhone("+375 29 123-45-67"), "+375291234567");
  assert.equal(formatPhone("+375291234567"), "+375291234567");
  for (const invalid of [
    "",
    "+7",
    "12345",
    "+712345678901",
    "+01234567890",
    "375291234567",
    "+7 (999) CALL-ME",
    "tel:+79997654321",
    "javascript:alert(1)",
    "+79997654321;ext=12",
    "++79997654321",
    "+7999\n7654321",
    "<script>79997654321</script>",
    "+1234567890123456",
    "9".repeat(41),
    null,
    undefined,
    79997654321,
    true,
    [],
    {},
  ])
    assert.equal(normalizePhone(invalid), "", String(invalid));
  assert.equal(contactPhone(), DEFAULT_PHONE);
  assert.equal(contactPhone({ phone: "" }), DEFAULT_PHONE);
});
