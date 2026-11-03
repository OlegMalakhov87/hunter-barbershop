// Один список полей используют чтение, сохранение и серверная валидация контактов.
const CONTACT_LINK_FIELDS = ["whatsappUrl", "telegramUrl", "vkUrl", "maxUrl", "instagramUrl"];

/** Возвращает адрес только для разрешённого сервиса и протокола HTTPS. */
function allowedUrl(value, hosts) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname)
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

/** Нормализует контакт и отклоняет ссылки на посторонние сайты. */
function normalizeContact(field, value) {
  if (field === "whatsappUrl") {
    const link = allowedUrl(value, ["wa.me"]);
    if (!link) return "";
    const url = new URL(link);
    if (!/^\/\+?[1-9][0-9]{9,14}\/?$/.test(url.pathname)) return "";
    const phone = url.pathname.replace(/\D/g, "");
    return "https://wa.me/" + phone;
  }
  if (field === "telegramUrl") return allowedUrl(value, ["t.me", "telegram.me"]);
  if (field === "vkUrl")
    return allowedUrl(value, ["vk.ru", "www.vk.ru", "vk.com", "www.vk.com", "m.vk.com"]);
  if (field === "maxUrl") return allowedUrl(value, ["max.ru"]);
  if (field === "instagramUrl") return allowedUrl(value, ["instagram.com", "www.instagram.com"]);
  return "";
}

/** Возвращает проверенные контакты без рекламных меток. */
function contactLinks(values = {}) {
  return Object.fromEntries(
    CONTACT_LINK_FIELDS.map((field) => [field, normalizeContact(field, values[field])]),
  );
}

/** Добавляет при необходимости метки для публичных ссылок. */
function publicLinks(values) {
  const links = contactLinks(values);
  for (const [field, value] of Object.entries(links)) {
    if (!value || !process.env.UTM_SOURCE) continue;
    const url = new URL(value);
    url.searchParams.set("utm_source", process.env.UTM_SOURCE);
    if (process.env.UTM_MEDIUM) url.searchParams.set("utm_medium", process.env.UTM_MEDIUM);
    if (process.env.UTM_CAMPAIGN) url.searchParams.set("utm_campaign", process.env.UTM_CAMPAIGN);
    links[field] = url.toString();
  }
  return links;
}

module.exports = { CONTACT_LINK_FIELDS, contactLinks, normalizeContact, publicLinks };
