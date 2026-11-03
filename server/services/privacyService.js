const fs = require("node:fs/promises");
const path = require("node:path");
const escapeHtml = require("escape-html");
const { PrivacyPolicy } = require("../database");

/** Возвращает сохранённый документ или исходный проект политики. */
async function getPrivacyText(transaction) {
  const policy = await PrivacyPolicy.findByPk(1, { transaction });
  if (policy) return policy.text;
  return (await fs.readFile(path.join(__dirname, "..", "privacy-default.txt"), "utf8")).trim();
}

/** Преобразует обычный текст в безопасные разделы и абзацы. */
function renderPrivacyText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      const heading = /^\d{1,2}\.\s/.test(lines[0]) ? lines.shift() : "";
      const title = heading ? "<h2>" + escapeHtml(heading) + "</h2>" : "";
      const content = lines.length ? "<p>" + lines.map(escapeHtml).join("<br>") + "</p>" : "";
      return title + content;
    })
    .join("\n");
}

module.exports = { getPrivacyText, renderPrivacyText };
