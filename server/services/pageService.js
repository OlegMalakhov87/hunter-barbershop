const fs = require("node:fs/promises");
const path = require("node:path");
const escapeHtml = require("escape-html");
const { Service, Master } = require("../database");
const { renderServices, renderMasters, renderHeroPrice } = require("./catalogViewService");
const { servicePrices } = require("./catalogService");
const { siteUrl, pagesDirectory, publicDirectory } = require("../config/environment");
const { externalBookingUrl, widget } = require("../config/booking");
const { formatPhone } = require("../config/phone");
const { getContacts } = require("./contactsService");
const { getPrivacyText } = require("./privacyService");
const { renderLegalText } = require("./legalTextService");
const { getConsentText } = require("./consentService");
const metrics = require("./metricsService");
const { imageRequirements, describeImage, maxImageDimension } = require("../config/images");

/**
 * @file pageService.js
 * @description Сервис для работы со страницами.
 */

/** Не позволяет закрыть HTML-тег script содержимым строки JSON.
 * @param {any} value - значение для JSON.
 * @returns {string} - безопасная строка JSON.
 */
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

/** Подставляет строку буквально: знаки $&, $` и $' не становятся командами замены.
 * @param {string} html - исходный HTML.
 * @param {string} token - строка, которую нужно заменить.
 * @param {string} value - строка, которой нужно заменить.
 * @returns {string} - HTML с заменой.
 */
function replaceToken(html, token, value) {
  return html.replaceAll(token, () => value);
}

/** Обновляет версии CSS, JS и логотипов, чтобы браузер не показывал старые файлы из кэша.
 * @param {string} html - исходный HTML.
 * @returns {Promise<string>} - HTML с версиями файлов.
 * @throws {Error} - если не удалось прочитать файл.
 */
async function versionAssets(html) {
  const assets = [
    ...html.matchAll(
      /(href|src)="(\/(?:(?:css|js)\/[a-zA-Z0-9/_-]+\.(?:css|js)|images\/(?:hunter-label|hunter-hero-seal|favicon(?:-32|-48|-120|-192|-512)?|apple-touch-icon)\.(?:png|webp|ico)))(?:\?[^"]*)?"/g,
    ),
  ];
  for (const [original, attribute, url] of assets) {
    const stat = await fs.stat(path.join(publicDirectory, url.slice(1)));
    html = replaceToken(
      html,
      original,
      `${attribute}="${url}?v=${Math.trunc(stat.mtimeMs).toString(36)}"`,
    );
  }
  return html;
}

// Возвращает поисковую разметку JSON-LD для бизнеса и услуг.
const business = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  name: "Hunter",
  url: siteUrl.origin,
  address: {
    "@type": "PostalAddress",
    streetAddress: "проспект Строителей, 1/42, ТЦ Рай, 2 этаж",
    addressLocality: "Смоленск",
    addressCountry: "RU",
  },
  openingHours: "Mo-Su 10:00-20:00",
  geo: { "@type": "GeoCoordinates", latitude: 54.767856, longitude: 32.098368 },
};

/** Собирает поисковую разметку из того же прайса, который видит посетитель.
 * @param {Object[]} services - массив объектов услуг.
 * @returns {string} Безопасный JSON для вставки в HTML.
 */
function servicesSchema(services) {
  return safeJson({
    "@context": "https://schema.org",
    "@graph": services.map((service) => ({
      "@type": "Service",
      name: service.name,
      provider: { "@type": "HairSalon", name: "Hunter" },
      offers: servicePrices(service).map(([name, price]) => ({
        "@type": "Offer",
        name: name || service.name,
        price,
        priceCurrency: "RUB",
      })),
    })),
  });
}

/**
 * Собирает страницу из доверенного HTML и экранированных данных.
 * @param {string} file Имя шаблона из фиксированного списка маршрутов.
 * @param {string} nonce Случайный ключ CSP для текущего ответа.
 * @returns {Promise<string>} Готовая HTML-страница с версиями CSS и JS.
 */
async function renderPage(file, nonce) {
  let html = await fs.readFile(path.join(pagesDirectory, file), "utf8");
  const replacements = {
    __SITE_URL__: escapeHtml(siteUrl.origin),
    __BOOKING_READY__: externalBookingUrl ? "true" : "false",
    __BOOKING_WIDGET_SCRIPT__: widget ? escapeHtml(widget.scriptOrigin + "/widgetJS") : "",
    __BOOKING_WIDGET_URL__: widget ? escapeHtml(externalBookingUrl) : "",
  };
  for (const [token, value] of Object.entries(replacements))
    html = replaceToken(html, token, value);
  if (file === "admin.html") {
    // Клиент получает те же размеры и подсказки, которыми проверяется файл на сервере.
    for (const [kind, requirements] of Object.entries(imageRequirements)) {
      const prefix = `__${kind.toUpperCase()}_IMAGE`;
      const hint = describeImage(requirements);
      html = replaceToken(
        html,
        `${prefix}_RULES__`,
        escapeHtml(JSON.stringify({ ...requirements, hint, maxDimension: maxImageDimension })),
      );
      html = replaceToken(html, `${prefix}_HINT__`, escapeHtml(hint));
    }
  }
  html = html.replace(
    /<script type="application\/ld\+json"/g,
    () => `<script nonce="${nonce}" type="application/ld+json"`,
  );

  if (file === "privacy.html")
    html = replaceToken(html, "__PRIVACY_CONTENT__", renderLegalText(await getPrivacyText()));
  if (file === "consent.html" || file === "publication-consent.html") {
    const kind = file === "consent.html" ? "processing" : "publication";
    html = replaceToken(html, "__CONSENT_CONTENT__", renderLegalText(await getConsentText(kind)));
  }
  if (file === "index.html") {
    const [services, masters, contacts] = await Promise.all([
      Service.findAll({
        where: { isActive: true },
        attributes: [
          "name",
          "category",
          "description",
          "price",
          "barberPrice",
          "topBarberPrice",
          "isPopular",
        ],
        order: [["id", "ASC"]],
      }),
      Master.findAll({
        where: { isActive: true },
        attributes: ["name", "role", "description", "photo"],
        order: [["id", "ASC"]],
      }),
      getContacts(),
    ]);
    html = html
      .replace(/href="tel:[^"]*"/g, () => `href="tel:${escapeHtml(contacts.phone)}"`)
      .replace(
        /(<span\b[^>]*\bdata-phone-text(?=[\s=>])[^>]*>)[\s\S]*?(<\/span>)/g,
        (_match, start, end) => start + escapeHtml(formatPhone(contacts.phone)) + end,
      );
    // Один сохранённый номер используется в видимых контактах, ссылках звонка и JSON-LD.
    html = replaceToken(
      html,
      "__LOCAL_BUSINESS_SCHEMA__",
      safeJson({ ...business, telephone: contacts.phone }),
    );
    html = replaceToken(html, "__SERVICE_SCHEMA__", servicesSchema(services));
    html = replaceToken(html, "__SERVICES_CONTENT__", renderServices(services));
    html = replaceToken(html, "__MASTERS_CONTENT__", renderMasters(masters));
    html = replaceToken(html, "__HERO_PRICE_NOTE__", renderHeroPrice(services));
  }
  if (file !== "admin.html") {
    html = replaceToken(
      html,
      "</head>",
      `<script defer src="/js/privacy-consent.js" data-counter-id="${metrics.metricId()}"></script></head>`,
    );
  }
  return versionAssets(html);
}

module.exports = { renderPage };
