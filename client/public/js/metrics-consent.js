/** @file Выбор аналитики: счётчик запускается только после разрешения посетителя. */
(() => {
  const counterId = document.currentScript?.dataset.counterId || "";
  if (!/^\d{1,12}$/.test(counterId)) return;
  const storageKey = "hunter-metrika-choice-v1";
  const disableKey = "disableYaCounter" + counterId;
  let memoryChoice = null;
  let started = false;
  let banner;

  function readChoice() {
    try {
      const value = localStorage.getItem(storageKey) || memoryChoice;
      return value === "yes" || value === "no" ? value : null;
    } catch {
      return memoryChoice;
    }
  }

  function saveChoice(value) {
    memoryChoice = value;
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* Без хранилища выбор действует только до закрытия страницы. */
    }
  }

  /** Удаляет доступные сайту данные Метрики; сторонние хранилища браузер не раскрывает. */
  function clearLocalMetricsData() {
    try {
      Object.keys(localStorage)
        .filter((name) => name.startsWith("_ym"))
        .forEach((name) => localStorage.removeItem(name));
    } catch {
      /* Хранилище может быть недоступно. */
    }
    const domains = location.hostname.split(".");
    const paths = ["/", location.pathname];
    document.cookie.split(";").forEach((part) => {
      const name = part.trim().split("=")[0];
      if (!name.startsWith("_ym")) return;
      paths.forEach((cookiePath) => {
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

  /** Счётчик не загружается, пока посетитель явно его не разрешил. */
  function startMetrics() {
    if (started) return;
    started = true;
    window[disableKey] = false;
    const script = document.createElement("script");
    script.src = "/js/metrics.js";
    script.async = true;
    document.head.append(script);
  }

  function choose(value) {
    const hadMetrics = started;
    saveChoice(value);
    setBannerVisible(false);
    if (value === "yes") {
      startMetrics();
    } else {
      window[disableKey] = true;
      clearLocalMetricsData();
      if (hadMetrics) location.reload();
    }
  }

  window[disableKey] = readChoice() !== "yes";
  if (readChoice() === "yes") startMetrics();

  function setBannerVisible(visible) {
    if (!banner) return;
    banner.hidden = !visible;
    document.body.classList.toggle("metrics-prompt-open", visible);
  }

  function render() {
    const footer =
      document.querySelector(".footer-legal-links") || document.querySelector(".footer-bottom");
    if (footer) {
      const settings = document.createElement("button");
      settings.type = "button";
      settings.className = "metrics-settings";
      settings.textContent = "Настройки аналитики";
      settings.addEventListener("click", () => {
        setBannerVisible(true);
        banner.querySelector("button")?.focus();
      });
      footer.append(settings);
    }

    banner = document.createElement("section");
    banner.className = "metrics-banner";
    banner.setAttribute("aria-label", "Настройки Яндекс Метрики");
    banner.hidden = true;
    banner.setAttribute("aria-live", "polite");
    const heading = document.createElement("strong");
    heading.textContent = "Настройки аналитики";
    const description = document.createElement("p");
    description.textContent =
      "Разрешить Яндекс Метрике собирать данные о посещении, файлы cookie и технические сведения? Это помогает нам улучшать сайт. Вы можете отказаться и изменить выбор позже в подвале страницы. Выбор касается счётчика сайта; карта и запись работают через сторонние сервисы.";
    const policy = document.createElement("a");
    policy.href = "/privacy";
    policy.textContent = "Политика обработки персональных данных";
    policy.className = "metrics-policy";
    const actions = document.createElement("div");
    actions.className = "metrics-banner-actions";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "button button-primary";
    accept.textContent = "Разрешить";
    accept.addEventListener("click", () => choose("yes"));
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "button button-ghost";
    reject.textContent = "Отказаться";
    reject.addEventListener("click", () => choose("no"));
    actions.append(accept, reject);
    banner.append(heading, description, policy, actions);
    document.body.append(banner);
    setBannerVisible(!readChoice());
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();

  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey) return;
    if (event.newValue === "yes") {
      memoryChoice = "yes";
      setBannerVisible(false);
      startMetrics();
    } else {
      memoryChoice = null;
      window[disableKey] = true;
      if (started) location.reload();
      else setBannerVisible(event.newValue !== "no");
    }
  });
})();
