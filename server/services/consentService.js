const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { ConsentDocument } = require("../database");
const { getPrivacyText } = require("./privacyService");

const files = {
  processing: "consent-default.txt",
  publication: "publication-consent-default.txt",
};

/** Возвращает сохранённое согласие или исходный текст проекта. */
async function getConsentText(kind, transaction) {
  if (!Object.hasOwn(files, kind)) throw new Error("Неизвестный документ.");
  const saved = await ConsentDocument.findByPk(kind, { transaction });
  return saved
    ? saved.text
    : (await fs.readFile(path.join(__dirname, "..", files[kind]), "utf8")).trim();
}

/** Фиксирует точный текст и его отпечаток для сравнения при отправке отзыва. */
async function getLegalDocuments(transaction) {
  const texts = {
    privacy: await getPrivacyText(transaction),
    processing: await getConsentText("processing", transaction),
    publication: await getConsentText("publication", transaction),
  };
  const versions = Object.fromEntries(
    Object.entries(texts).map(([key, text]) => [
      key,
      createHash("sha256").update(text, "utf8").digest("hex"),
    ]),
  );
  return { texts, versions };
}

module.exports = { getConsentText, getLegalDocuments };
