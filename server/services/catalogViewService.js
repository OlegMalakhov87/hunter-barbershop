const escapeHtml = require("escape-html");
const { servicePrices } = require("./catalogService");

/**
 * @file catalogViewService.js
 * @description Сервис для работы с представлением каталога услуг.
 */

const text = (value) => escapeHtml(String(value ?? ""));
const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Number(value))}\u00a0₽`;
const localPhoto = /^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/;

/** Формирует весь активный прайс в HTML; фильтры браузера скрывают уже готовые строки.
 * @param {Object[]} services - массив объектов услуг.
 * @returns {string} - HTML-код прайса.
 */
function renderServices(services) {
  if (!services.length)
    return '<p class="loading-state">Пока нет услуг. Уточните прайс по телефону.</p>';
  return services
    .map((service) => {
      const prices = servicePrices(service);
      return `<article class="service-row" data-category="${text(service.category)}" data-popular="${service.isPopular ? "true" : "false"}">
      <div class="service-detail"><h3>${text(service.name)}</h3><p>${text(service.description || service.category)}</p></div>
      <div class="service-prices">${prices.map(([label, value]) => `<div class="service-price-group"><span class="service-price-label">${text(label)}</span><strong class="service-price">${text(money(value))}</strong></div>`).join("")}</div>
      <a class="service-action" href="/booking" aria-label="${text(`Открыть запись. Услугу «${service.name}» выберите в форме`)}">↗</a>
    </article>`;
    })
    .join("\n");
}

/** Возвращает карточки мастеров без внешних адресов фото и без исполняемых атрибутов.
 * @param {Object[]} masters - массив объектов мастеров.
 * @returns {string} - HTML-код карточек мастеров.
 */
function renderMasters(masters) {
  if (!masters.length)
    return '<p class="loading-state">Мастера пока не добавлены. Уточните свободное время по телефону.</p>';
  return masters
    .map((master) => {
      const hasPhoto = localPhoto.test(master.photo || "");
      return `<article class="master-card"><div class="master-portrait">
      ${hasPhoto ? `<img src="${text(master.photo)}" alt="${text(`Мастер ${master.name}`)}" loading="lazy" decoding="async" data-master-photo />` : ""}
      <div class="master-placeholder"${hasPhoto ? " hidden" : ""}><img src="/images/hunter-label.webp" alt="" /><span>Фото мастера скоро появится</span></div>
      </div><div class="master-overlay"><div class="master-info"><div><h3>${text(master.name)}</h3><p>${text(master.role)}</p></div>
      <a href="/booking" aria-label="${text(`Открыть онлайн-запись. Мастера ${master.name} выберите в форме`)}">↗</a></div>
      ${master.description ? `<p class="caption">${text(master.description)}</p>` : ""}</div></article>`;
    })
    .join("\n");
}

/** Подсказка первого экрана использует те же цены, что HTML-прайс и JSON-LD.
 * @param {Object[]} services - массив объектов услуг.
 * @returns {string} - HTML-код подсказки.
 */
function renderHeroPrice(services) {
  const haircut = services.find((service) => /^мужская стрижка$/i.test(service.name.trim()));
  let value = "";
  if (haircut) {
    const prices = servicePrices(haircut).map(([label, price]) =>
      label ? `${label.toLocaleLowerCase("ru-RU")} ${money(price)}` : money(price),
    );
    if (prices.length) value = `Мужская стрижка: ${prices.join(" · ")}.`;
  }
  return `<p class="hero-price-note" id="hero-price-note"${value ? "" : " hidden"}>${text(value)}</p>`;
}

module.exports = { renderServices, renderMasters, renderHeroPrice };
