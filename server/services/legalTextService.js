const fs = require("node:fs/promises");
const path = require("node:path");
const escapeHtml = require("escape-html");
const { siteUrl } = require("../config/environment");
const { applyReviewRetention } = require("../config/reviewRetention");

/** Читает исходный документ из фиксированного имени файла и подставляет настройки сайта.
 * @param {string} file Имя из кода сервиса, без пользовательского ввода.
 * @returns {Promise<string>} Текст с адресом сайта и действующими сроками хранения.
 */
async function readDefaultLegalText(file) {
  const source = await fs.readFile(path.join(__dirname, "..", file), "utf8");
  return applyReviewRetention(source.trim().replaceAll("__SITE_URL__", () => siteUrl.origin));
}

/** Преобразует обычный текст политики или согласия в безопасные заголовки и абзацы.
 * @param {string} text Текст документа; HTML внутри него не исполняется.
 * @returns {string} Разметка документа с якорем раздела cookies при его наличии.
 */
function renderLegalText(text) {
  let cookiesAnchorAdded = false;
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => {
      const lines = paragraph.split("\n");
      const heading = /^\d{1,2}\.\s/.test(lines[0]) ? lines.shift() : "";
      const cookiesHeading = heading && /cookies|cookie|куки/i.test(heading) && !cookiesAnchorAdded;
      if (cookiesHeading) cookiesAnchorAdded = true;
      const title = heading
        ? `<h2${cookiesHeading ? ' id="cookies"' : ""}>` + escapeHtml(heading) + "</h2>"
        : "";
      const content = lines.length ? "<p>" + lines.map(escapeHtml).join("<br>") + "</p>" : "";
      return title + content;
    })
    .join("\n");
}

module.exports = { readDefaultLegalText, renderLegalText };
