/** @file Общее разрешение внешней карты и аналитики; до выбора запросов к ним нет. */

(() => {
  const configuredId = document.currentScript?.dataset.counterId || "";
  const counterId = /^\d{1,12}$/.test(configuredId) ? configuredId : "";
  const storageKey = "hunter-external-services-choice-v2";
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const disableKey = counterId ? "disableYaCounter" + counterId : "";
  let memoryChoice = null;
  let started = false;
  let banner;

  /** Чтение выбора из хранилища или памяти открытой страницы. */
  function readChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") || memoryChoice;
      if (
        saved &&
        ["yes", "no"].includes(saved.value) &&
        Number.isFinite(saved.expiresAt) &&
        saved.expiresAt > Date.now()
      )
        return saved.value;
    } catch {
      /* При запрете хранилища выбор действует в памяти открытой страницы. */
    }
    return memoryChoice && memoryChoice.expiresAt > Date.now() ? memoryChoice.value : null;
  }

  /** Сохранение выбора в хранилище и памяти открытой страницы.
   * @param {string} value - Выбор: "yes" или "no"
   */
  function saveChoice(value) {
    memoryChoice = { value, expiresAt: Date.now() + lifetime };
    try {
      localStorage.setItem(storageKey, JSON.stringify(memoryChoice));
    } catch {
      /* Без хранилища сайт продолжает работать. */
    }
  }

  /** Меняет только карту нашего сайта; недоступные сторонние cookies не обещает удалить.
   * @param {boolean} allowed - Разрешено ли показывать карту
   */
  function updateMaps(allowed) {
    document.querySelectorAll("[data-map-src]").forEach((panel) => {
      const placeholder = panel.querySelector(".map-placeholder");
      const existing = panel.querySelector("iframe");
      if (!allowed) {
        existing?.remove();
        if (placeholder) placeholder.hidden = false;
        return;
      }
      if (existing) return;
      let url;
      try {
        url = new URL(panel.dataset.mapSrc);
      } catch {
        return;
      }
      if (
        url.protocol !== "https:" ||
        !["yandex.ru", "yandex.com"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.port
      )
        return;
      const frame = document.createElement("iframe");
      frame.title = panel.dataset.mapTitle || "Карта барбершопа Hunter";
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer-when-downgrade";
      frame.src = url.href;
      if (placeholder) placeholder.hidden = true;
      panel.prepend(frame);
    });
  }

  /** Удаляет cookies и localStorage Яндекс Метрики, если они доступны. */
  function clearLocalMetricsData() {
    try {
      Object.keys(localStorage)
        .filter((name) => name.startsWith("_ym"))
        .forEach((name) => localStorage.removeItem(name));
    } catch {
      /* Хранилище может быть недоступно. */
    }
    const domains = location.hostname.split(".");
    document.cookie.split(";").forEach((part) => {
      const name = part.trim().split("=")[0];
      if (!name.startsWith("_ym")) return;
      ["/", location.pathname].forEach((cookiePath) => {
        document.cookie = name + "=; Max-Age=0; path=" + cookiePath + "; SameSite=Lax";
        domains.forEach((_part, index) => {
          const domain = domains.slice(index).join(".");
          if (domain.includes("."))
            document.cookie =
              name + "=; Max-Age=0; path=" + cookiePath + "; domain=." + domain + "; SameSite=Lax";
        });
      });
    });
  }

  /** Загружает скрипт Яндекс Метрики, если он ещё не был загружен. */
  function startMetrics() {
    if (!counterId || started) return;
    started = true;
    window[disableKey] = false;
    const script = document.createElement("script");
    script.src = "/js/metrics.js";
    script.async = true;
    document.head.append(script);
  }

  /** Проверяет, есть ли незавершённый отзыв в форме. */
  function hasUnfinishedReview() {
    const form = document.getElementById("review-form");
    if (!form) return false;
    return [...form.elements].some((field) =>
      field.type === "checkbox"
        ? field.checked
        : ["name", "rating", "text", "fullName", "phone", "publicationConditions"].includes(
            field.name,
          ) && field.value !== "",
    );
  }

  /** Показывает или скрывает баннер с выбором. */
  function setBannerVisible(visible) {
    if (!banner) return;
    banner.hidden = !visible;
    document.body.classList.toggle("metrics-prompt-open", visible);
  }

  /** Обрабатывает выбор пользователя. */
  function choose(value) {
    if (
      value === "no" &&
      started &&
      hasUnfinishedReview() &&
      !window.confirm(
        "Отключение аналитики обновит страницу. Заполненный отзыв будет удалён. Продолжить?",
      )
    )
      return;
    const hadMetrics = started;
    saveChoice(value);
    setBannerVisible(false);
    updateMaps(value === "yes");
    if (value === "yes") startMetrics();
    else {
      if (disableKey) window[disableKey] = true;
      clearLocalMetricsData();
      if (hadMetrics) location.reload();
    }
  }

  /** Показывает баннер с настройками. */
  function openSettings() {
    setBannerVisible(true);
    banner?.querySelector("button")?.focus();
  }

  /** Создаёт баннер и кнопку настроек, применяет выбор пользователя. */
  function render() {
    const footer =
      document.querySelector(".footer-legal-links") || document.querySelector(".footer-bottom");
    if (footer) {
      const settings = document.createElement("button");
      settings.type = "button";
      settings.className = "metrics-settings";
      settings.textContent = "Настройки cookies";
      settings.addEventListener("click", openSettings);
      footer.append(settings);
    }
    banner = document.createElement("section");
    banner.className = "metrics-banner";
    banner.setAttribute("aria-label", "Cookies и внешние сервисы");
    banner.setAttribute("aria-live", "polite");
    banner.hidden = true;
    const heading = document.createElement("strong");
    heading.textContent = "Cookies и внешние сервисы";
    const description = document.createElement("p");
    description.textContent =
      "Разрешить встроенную карту Яндекса и, если она подключена, Яндекс Метрику? Сервисы могут использовать cookies, сведения об устройстве и посещении сайта. При отказе встроенная карта и аналитика не загружаются. Услуги, фотографии, отзывы, телефон и переход к записи остаются доступны. Выбор можно изменить внизу страницы.";
    const policy = document.createElement("a");
    policy.href = "/privacy#cookies";
    policy.className = "metrics-policy";
    policy.textContent = "Как мы используем cookies и данные";
    const actions = document.createElement("div");
    actions.className = "metrics-banner-actions";
    [
      ["yes", "Принять", "button-primary"],
      ["no", "Отказаться", "button-ghost"],
    ].forEach(([value, label, style]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button " + style;
      button.textContent = label;
      button.addEventListener("click", () => choose(value));
      actions.append(button);
    });
    banner.append(heading, description, policy, actions);
    document.body.append(banner);
    document
      .querySelectorAll("[data-privacy-settings]")
      .forEach((button) => button.addEventListener("click", openSettings));
    const choice = readChoice();
    if (disableKey) window[disableKey] = choice !== "yes";
    updateMaps(choice === "yes");
    if (choice === "yes") startMetrics();
    else clearLocalMetricsData();
    setBannerVisible(!choice);
  }

  /** Инициализация после загрузки DOM. */
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();

  /** Обновление выбора при изменении в другой вкладке. */
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    memoryChoice = null;
    const choice = readChoice();
    updateMaps(choice === "yes");
    if (choice === "yes") {
      startMetrics();
      setBannerVisible(false);
    } else {
      if (disableKey) window[disableKey] = true;
      clearLocalMetricsData();
      // При отзыве в другой вкладке сразу останавливаем счётчик, не стирая черновик.
      if (started && typeof window.ym === "function") window.ym(Number(counterId), "destruct");
      if (started && !hasUnfinishedReview()) location.reload();
      else {
        started = false;
        setBannerVisible(choice !== "no");
      }
    }
  });
})();
