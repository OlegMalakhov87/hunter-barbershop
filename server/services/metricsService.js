/**
 * @file metricsService.js
 * @description Сервис для работы с Яндекс.Метрикой.
 */

/** Возвращает корректный номер счётчика из .env или пустую строку. */
function metricId() {
  const value = String(process.env.YANDEX_METRIKA_ID || "");
  return /^\d{1,12}$/.test(value) ? value : "";
}

/** Встраивает счётчик только при наличии корректного номера в .env. */
function script() {
  const id = metricId();
  if (!id) return "";

  return `

    (function (windowObject, documentObject, elementName, scriptUrl, methodName, script, firstScript) {
      windowObject[methodName] = windowObject[methodName] || function () {
        (windowObject[methodName].a = windowObject[methodName].a || []).push(arguments);
      };
      windowObject[methodName].l = 1 * new Date();
      script = documentObject.createElement(elementName);
      firstScript = documentObject.getElementsByTagName(elementName)[0];
      script.async = 1;
      script.src = scriptUrl;
      firstScript.parentNode.insertBefore(script, firstScript);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

    ym(${id}, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false
    });
  `;
}

module.exports = { metricId, script };
