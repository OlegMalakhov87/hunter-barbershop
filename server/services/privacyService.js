const { PrivacyPolicy } = require("../database");
const { readDefaultLegalText } = require("./legalTextService");

/** Возвращает сохранённый документ или исходный текст политики.
 * @param {import("sequelize").Transaction} [transaction] Транзакция базы данных.
 * @returns {Promise<string>} Текст политики.
 */
async function getPrivacyText(transaction) {
  const policy = await PrivacyPolicy.findByPk(1, { transaction });
  return policy ? policy.text : readDefaultLegalText("privacy-default.txt");
}

module.exports = { getPrivacyText };
