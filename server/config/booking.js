/** Разрешает переадресацию только на HTTPS-адрес YCLIENTS. */
function bookingUrl(value) {
  if (!value) return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("YCLIENTS_BOOKING_URL: укажите корректный HTTPS-адрес YCLIENTS.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !/(^|\.)yclients\.ru$/i.test(url.hostname)
  ) {
    throw Error("YCLIENTS_BOOKING_URL должен вести на https://yclients.ru.");
  }
  return url.href;
}

/** Определяет разрешённые адреса официального виджета по номеру формы. */
function bookingWidget(value) {
  if (!value) return null;
  const url = new URL(value);
  const match = /^n(\d{1,12})\.yclients\.ru$/i.exec(url.hostname);
  if (!match || url.pathname !== "/" || url.hash) return null;
  const id = match[1];
  return {
    scriptOrigin: `https://w${id}.yclients.ru`,
    formOrigin: `https://n${id}.yclients.ru`,
    legacyOrigin: `https://b${id}.yclients.ru`,
  };
}

const externalBookingUrl = bookingUrl(process.env.YCLIENTS_BOOKING_URL);
module.exports = {
  bookingUrl,
  bookingWidget,
  externalBookingUrl,
  widget: bookingWidget(externalBookingUrl),
};
