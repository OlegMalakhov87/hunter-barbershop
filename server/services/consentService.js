const { createHash } = require("node:crypto");
const { ConsentDocument } = require("../database");
const { getPrivacyText } = require("./privacyService");
const { readDefaultLegalText } = require("./legalTextService");

/**
 * @file consentService.js
 * @description Сервис для работы с согласием на обработку персональных данных.
 */

/** Файлы с исходным текстом согласия, которые можно редактировать в админке. */
const files = {
  processing: "consent-default.txt",
  publication: "publication-consent-default.txt",
};

/** Возвращает сохранённое согласие или исходный текст проекта.
 * @param {string} kind - тип документа: "processing" или "publication".
 * @param {import("sequelize").Transaction} [transaction] - транзакция базы данных.
 * @returns {Promise<string>} - текст согласия.
 * @throws {Error} - если указан неизвестный тип документа.
 */
async function getConsentText(kind, transaction) {
  if (!Object.hasOwn(files, kind)) throw new Error("Неизвестный документ.");
  const saved = await ConsentDocument.findByPk(kind, { transaction });
  return saved ? saved.text : readDefaultLegalText(files[kind]);
}

/** Фиксирует точный текст и его отпечаток для сравнения при отправке отзыва.
 * @param {import("sequelize").Transaction} [transaction] - транзакция базы данных.
 * @returns {Promise<{texts: Record<string, string>, versions: Record<string, string>}>} - тексты и их отпечатки.
 * @throws {Error} - если не удалось получить текст согласия.
 */
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
