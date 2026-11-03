const fs = require("node:fs/promises");
const path = require("node:path");
const escapeHtml = require("escape-html");
const { Service } = require("../database");
const { siteUrl, pagesDirectory, publicDirectory } = require("../config/environment");
const { externalBookingUrl, widget } = require("../config/booking");
const { formatPhone } = require("../config/phone");
const { getContacts } = require("./contactsService");
const { getPrivacyText, renderPrivacyText } = require("./privacyService");
const { getConsentText } = require("./consentService");
const metrics = require("./metricsService");

/** Не позволяет закрыть HTML-тег script содержимым строки JSON. */
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

/** Подставляет строку буквально: знаки $&, $` и $' не становятся командами замены. */
function replaceToken(html, token, value) {
  return html.replaceAll(token, () => value);
}

/** Добавляет версии всем локальным CSS и JS, включая скрипт списков выбора. */
async function versionAssets(html) {
  const assets = [
    ...html.matchAll(/(href|src)="(\/(?:css|js)\/[a-zA-Z0-9/_-]+\.(?:css|js))(?:\?[^"]*)?"/g),
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

const business = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  name: "Hunter",
  url: siteUrl.origin,
  address: {
    "@type": "PostalAddress",
    streetAddress: "улица Рыленкова, 18",
    addressLocality: "Смоленск",
    addressCountry: "RU",
  },
  openingHours: "Mo-Su 10:00-20:00",
  geo: { "@type": "GeoCoordinates", latitude: 54.761443, longitude: 32.09727 },
};

/** Собирает поисковую разметку из того же прайса, который видит посетитель. */
function servicesSchema(services) {
  return safeJson({
    "@context": "https://schema.org",
    "@graph": services.map((service) => ({
      "@type": "Service",
      name: service.name,
      provider: { "@type": "HairSalon", name: "Hunter" },
      offers:
        service.barberPrice === null && service.topBarberPrice === null
          ? [{ "@type": "Offer", price: service.price, priceCurrency: "RUB" }]
          : [
              ["Барбер", service.barberPrice],
              ["Топ-барбер", service.topBarberPrice],
            ]
              .filter(([, price]) => price !== null)
              .map(([name, price]) => ({ "@type": "Offer", name, price, priceCurrency: "RUB" })),
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
  html = html.replace(
    /<script type="application\/ld\+json"/g,
    () => `<script nonce="${nonce}" type="application/ld+json"`,
  );

  if (file === "privacy.html")
    html = replaceToken(html, "__PRIVACY_CONTENT__", renderPrivacyText(await getPrivacyText()));
  if (file === "consent.html" || file === "publication-consent.html") {
    const kind = file === "consent.html" ? "processing" : "publication";
    html = replaceToken(html, "__CONSENT_CONTENT__", renderPrivacyText(await getConsentText(kind)));
  }
  if (file === "index.html") {
    const [services, contacts] = await Promise.all([
      Service.findAll({
        where: { isActive: true },
        attributes: ["name", "price", "barberPrice", "topBarberPrice"],
      }),
      getContacts(),
    ]);
    html = html
      .replace(/href="tel:[^"]*"/g, () => `href="tel:${escapeHtml(contacts.phone)}"`)
      .replace(
        /(<span\b[^>]*\bdata-phone-text(?=[\s=>])[^>]*>)[\s\S]*?(<\/span>)/g,
        (_match, start, end) => start + escapeHtml(formatPhone(contacts.phone)) + end,
      );
    html = replaceToken(
      html,
      "__LOCAL_BUSINESS_SCHEMA__",
      safeJson({ ...business, telephone: contacts.phone }),
    );
    html = replaceToken(html, "__SERVICE_SCHEMA__", servicesSchema(services));
  }
  if (metrics.metricId() && file !== "admin.html") {
    html = replaceToken(
      html,
      "</head>",
      `<script defer src="/js/metrics-consent.js" data-counter-id="${metrics.metricId()}"></script></head>`,
    );
  }
  return versionAssets(html);
}

module.exports = { renderPage };
