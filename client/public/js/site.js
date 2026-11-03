/** @file Публичный сайт: меню и запись, карточки, просмотр фото, отзывы и контакты. */
(() => {
  const nav = document.getElementById("site-nav");
  const toggle = document.querySelector(".menu-toggle");

  /** Открывает и закрывает мобильное меню, сохраняя доступное состояние кнопки. */
  if (nav && toggle) {
    const setMenuOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
      nav.classList.toggle("open", open);
    };

    toggle.addEventListener("click", () => {
      setMenuOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setMenuOpen(false);
    });
    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) {
        setMenuOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        setMenuOpen(false);
        toggle.focus();
      }
    });
    matchMedia("(max-width: 1024px)").addEventListener("change", () => setMenuOpen(false));
  }

  /** Подключает официальный виджет к существующим и динамическим кнопкам записи. */
  function setupBookingWidget() {
    const source = document.body.dataset.bookingWidgetScript;
    const bookingUrl = document.body.dataset.bookingWidgetUrl;
    if (!source || !bookingUrl) return;

    // YCLIENTS привязывает обработчик к этой кнопке при загрузке скрипта.
    const trigger = document.createElement("a");
    // Оставляем выбор адреса формы самому виджету, сохраняя параметры ссылки.
    trigger.href = "/booking" + new URL(bookingUrl).search;
    trigger.className = "ms_booking";
    trigger.hidden = true;
    trigger.setAttribute("aria-hidden", "true");
    trigger.tabIndex = -1;
    document.body.append(trigger);

    // Скрипт сервиса загружается только после нажатия на запись.
    window.yWidgetSettings = { buttonAutoShow: false, formPosition: "right" };
    let widgetPromise;
    let opening = false;
    function loadWidget() {
      if (widgetPromise) return widgetPromise;
      widgetPromise = new Promise((resolve) => {
        const script = document.createElement("script");
        let settled = false;
        const finish = (ready) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(ready);
        };
        const timeout = window.setTimeout(() => finish(false), 8000);
        script.src = source;
        script.async = true;
        script.addEventListener(
          "load",
          () => {
            finish(Boolean(window.yWidget?.initialized && window.yWidget?.cover));
          },
          { once: true },
        );
        script.addEventListener("error", () => finish(false), { once: true });
        document.head.append(script);
      });
      return widgetPromise;
    }

    document.addEventListener("click", async (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target.closest("a[href='/booking']");
      if (
        !link ||
        link === trigger ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      event.preventDefault();
      if (opening) return;
      opening = true;
      link.setAttribute("aria-busy", "true");
      try {
        if (!(await loadWidget())) {
          window.location.assign(link.href);
          return;
        }
        trigger.click();
        document.querySelector(".yWidgetIFrame")?.setAttribute("title", "Онлайн-запись YCLIENTS");
        document.querySelector(".yCloseIcon")?.setAttribute("aria-label", "Закрыть онлайн-запись");
      } finally {
        opening = false;
        link.removeAttribute("aria-busy");
      }
    });
  }

  setupBookingWidget();

  /** Получает текущую дату  */
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  /** Создаёт узел с безопасным текстом для данных, пришедших из API. */
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  };

  /** Форматирует число в рублях с разделением тысяч. */
  const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Number(value))}\u00a0₽`;

  /** Строит строку услуги без вставки непроверенного HTML. */
  const serviceRow = (service) => {
    const row = el("article", "service-row");

    const detail = el("div", "service-detail");
    detail.append(el("h3", "", service.name), el("p", "", service.description || service.category));
    const prices = el("div", "service-prices");
    const addPrice = (label, value) => {
      const group = el("div", "service-price-group");
      group.append(
        el("span", "service-price-label", label),
        el("strong", "service-price", money(value)),
      );
      prices.append(group);
    };
    if (service.barberPrice == null && service.topBarberPrice == null) {
      addPrice("Общая цена", service.price);
    } else {
      if (service.barberPrice != null) addPrice("Барбер", service.barberPrice);
      if (service.topBarberPrice != null) addPrice("Топ-барбер", service.topBarberPrice);
    }
    row.append(detail, prices);

    const link = el("a", "service-action", "↗");
    link.href = "/booking";
    link.setAttribute("aria-label", `Открыть запись. Услугу «${service.name}» выберите в форме`);
    row.append(link);
    return row;
  };

  /** Строит карточку мастера; для фото разрешены только локальные пути. */
  const masterCard = (master) => {
    const card = el("article", "master-card");
    const portrait = el("div", "master-portrait");
    const photo = String(master.photo || "");
    const placeholder = () => {
      const content = el("div", "master-placeholder");
      const badge = el("img");
      badge.src = "/images/hunter-label.webp";
      badge.alt = "";
      content.append(badge, el("span", "", "Фото мастера скоро появится"));
      return content;
    };

    if (/^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(photo)) {
      const img = el("img");
      img.src = photo;
      img.alt = `Мастер ${master.name}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.remove();
        portrait.append(placeholder());
      };
      portrait.append(img);
    } else {
      portrait.append(placeholder());
    }

    const info = el("div", "master-info");
    const copy = el("div");
    copy.append(el("h3", "", master.name), el("p", "", master.role));

    const link = el("a", "", "↗");
    link.href = "/booking";
    link.setAttribute(
      "aria-label",
      `Открыть онлайн-запись. Мастера ${master.name} выберите в форме`,
    );
    info.append(copy, link);
    const overlay = el("div", "master-overlay");
    overlay.append(info);
    if (master.description) {
      overlay.append(el("p", "caption", master.description));
    }
    card.append(portrait, overlay);
    return card;
  };

  /**
   * Объединяет стрелки, клавиатуру, свайп и индикаторы одной ленты.
   * Автопрокрутки нет: текст отзыва и выбранное фото остаются на месте.
   * Число точек ограничено пятью независимо от размера галереи.
   * Для сеток управление включается только на телефоне и планшете.
   */
  function setupCarousel(track, { photos = false, mobileOnly = photos } = {}) {
    if (!track) return;
    const previous = document.querySelector(`[data-carousel-prev="${track.id}"]`);
    const next = document.querySelector(`[data-carousel-next="${track.id}"]`);
    const cards = [...track.children].filter((child) =>
      child.matches(".master-card, .review-card, .photo-card"),
    );
    if (!cards.length) return;
    const compact = matchMedia("(max-width: 1024px)");
    const isCarousel = () => !mobileOnly || compact.matches;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const dots = el("div", "carousel-dots");
    dots.setAttribute("role", "group");
    dots.setAttribute("aria-label", "Выбор карточки");
    const dotCount = Math.min(cards.length, 5);
    const buttons = Array.from({ length: dotCount }, () => {
      const button = el("button", "carousel-dot");
      button.type = "button";
      button.setAttribute("aria-controls", track.id);
      button.addEventListener("click", () => scrollToCard(Number(button.dataset.index)));
      dots.append(button);
      return button;
    });
    const counter = el("span", "carousel-counter");
    counter.setAttribute("aria-hidden", "true");
    if (cards.length > dotCount) dots.append(counter);
    track.insertAdjacentElement("afterend", dots);
    if (photos) {
      track.classList.add("photo-carousel");
      track.setAttribute("role", "region");
    }

    let currentIndex = 0;
    let previousWidth = track.clientWidth;
    const end = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const scrollToCard = (index, immediate = false) => {
      if (!isCarousel()) return;
      const card = cards[index];
      if (!card) return;
      const left =
        track.scrollLeft + card.getBoundingClientRect().left - track.getBoundingClientRect().left;
      track.scrollTo({
        left: Math.max(0, Math.min(end(), left)),
        behavior: immediate || reducedMotion.matches ? "auto" : "smooth",
      });
    };
    const update = () => {
      if (mobileOnly) {
        if (isCarousel()) track.setAttribute("tabindex", "0");
        else track.removeAttribute("tabindex");
      }
      if (!isCarousel()) {
        dots.hidden = true;
        return;
      }
      const last = end();
      if (previous) previous.disabled = last <= 2 || track.scrollLeft <= 2;
      if (next) next.disabled = last <= 2 || track.scrollLeft >= last - 2;
      dots.hidden = !compact.matches || cards.length < 2 || last <= 2;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const cardStep = cards[0].getBoundingClientRect().width + gap;
      currentIndex = cardStep
        ? Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / cardStep)))
        : 0;
      const first = Math.max(
        0,
        Math.min(currentIndex - Math.floor(dotCount / 2), cards.length - dotCount),
      );
      buttons.forEach((button, index) => {
        const cardIndex = first + index;
        button.dataset.index = String(cardIndex);
        button.setAttribute("aria-label", `Показать карточку ${cardIndex + 1} из ${cards.length}`);
        button.classList.toggle(
          "edge",
          (index === 0 && first > 0) || (index === dotCount - 1 && first + dotCount < cards.length),
        );
        if (cardIndex === currentIndex) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      counter.textContent = `${currentIndex + 1} / ${cards.length}`;
    };
    const step = (way) => {
      if (!isCarousel() || end() <= 2) return;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const distance = cards[0].getBoundingClientRect().width + gap;
      track.scrollTo({
        left: Math.max(0, Math.min(end(), track.scrollLeft + distance * way)),
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    };
    previous?.addEventListener("click", () => step(-1));
    next?.addEventListener("click", () => step(1));
    track.addEventListener("keydown", (event) => {
      if (event.target !== track || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      // Сетке не перехватываем стрелки клавиатуры: все карточки уже открыты.
      if (!isCarousel()) return;
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    });
    track.addEventListener("scroll", update, { passive: true });
    const resize = () => {
      if (compact.matches && track.clientWidth !== previousWidth) scrollToCard(currentIndex, true);
      previousWidth = track.clientWidth;
      update();
    };
    window.addEventListener("resize", resize);
    requestAnimationFrame(update);
  }

  /** Категории и цены приходят из базы; первый фильтр показывает весь прайс. */
  function setupServices(services) {
    const filters = document.getElementById("service-filters");
    const list = document.getElementById("home-services");
    if (!filters || !list) return;
    const choices = [{ label: "Все услуги", matches: () => true }];
    if (services.some((service) => service.isPopular)) {
      choices.push({ label: "Популярное", matches: (service) => service.isPopular });
    }
    [...new Set(services.map((service) => service.category))].forEach((category) => {
      choices.push({ label: category, matches: (service) => service.category === category });
    });
    let selected = 0;
    const render = () => {
      const visible = services.filter(choices[selected].matches);
      list.replaceChildren(...visible.map(serviceRow));
      if (!visible.length) list.append(el("p", "loading-state", "Пока нет услуг в этом разделе."));
      [...filters.children].forEach((button, index) => {
        button.classList.toggle("active", index === selected);
        button.setAttribute("aria-pressed", String(index === selected));
      });
    };
    filters.replaceChildren(
      ...choices.map((choice, index) => {
        const button = el("button", "filter-button", choice.label);
        button.type = "button";
        button.setAttribute("aria-controls", list.id);
        button.addEventListener("click", () => {
          selected = index;
          render();
        });
        return button;
      }),
    );
    render();

    // Подсказка на первом экране использует тот же прайс, без второй копии цен в HTML.
    const haircut = services.find((service) => /^мужская стрижка$/i.test(service.name.trim()));
    const note = document.getElementById("hero-price-note");
    if (note && haircut) {
      const prices = [];
      if (haircut.barberPrice != null) prices.push(`барбер ${money(haircut.barberPrice)}`);
      if (haircut.topBarberPrice != null)
        prices.push(`топ-барбер ${money(haircut.topBarberPrice)}`);
      note.textContent = `Мужская стрижка: ${prices.length ? prices.join(" · ") : money(haircut.price)}.`;
      note.hidden = false;
    }
  }

  /** Загружает прайс и мастеров для главной страницы. */
  async function loadCards() {
    const targets = [
      ["home-services", "/api/services", serviceRow],
      ["home-masters", "/api/masters", masterCard],
    ];

    await Promise.all(
      targets.map(async ([id, url, render]) => {
        const target = document.getElementById(id);
        if (!target) return;

        try {
          const response = await fetch(url);
          if (!response.ok) throw Error("Сервис недоступен");

          const items = await response.json();
          if (id === "home-services") setupServices(items);
          else target.replaceChildren(...items.map(render));
          if (id === "home-masters") setupCarousel(target, { mobileOnly: true });
          if (!items.length) {
            target.append(el("p", "loading-state", "Пока нет данных. Загляните позже."));
          }
        } catch {
          target.replaceChildren(
            el("p", "loading-state", "Не удалось загрузить данные. Обновите страницу."),
          );
        }
      }),
    );
  }

  /** Просмотр всех фото выбранного раздела. Диалог удерживает фокус и закрывается по Escape. */
  const viewer = document.getElementById("photo-viewer");
  let viewerPhotos = [];
  let viewerIndex = 0;
  let viewerOpener;
  function showViewerPhoto(index) {
    if (!viewer || !viewerPhotos.length) return;
    viewerIndex = Math.max(0, Math.min(viewerPhotos.length - 1, index));
    const photo = viewerPhotos[viewerIndex];
    const image = document.getElementById("photo-viewer-image");
    image.src = photo.path;
    image.alt = photo.caption || "Фото барбершопа Hunter";
    document.getElementById("photo-viewer-caption").textContent = photo.caption || "";
    document.getElementById("photo-viewer-count").textContent =
      `${viewerIndex + 1} / ${viewerPhotos.length}`;
    viewer.querySelector("[data-photo-prev]").disabled = viewerIndex === 0;
    viewer.querySelector("[data-photo-next]").disabled = viewerIndex === viewerPhotos.length - 1;
  }
  function openPhotoViewer(photos, index, opener) {
    if (!viewer) return;
    viewerPhotos = photos;
    viewerOpener = opener;
    showViewerPhoto(index);
    viewer.showModal();
    document.body.classList.add("photo-viewer-open");
    viewer.querySelector("[data-photo-close]").focus();
  }
  viewer?.querySelector("[data-photo-close]").addEventListener("click", () => viewer.close());
  viewer
    ?.querySelector("[data-photo-prev]")
    .addEventListener("click", () => showViewerPhoto(viewerIndex - 1));
  viewer
    ?.querySelector("[data-photo-next]")
    .addEventListener("click", () => showViewerPhoto(viewerIndex + 1));
  viewer?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    showViewerPhoto(viewerIndex + (event.key === "ArrowLeft" ? -1 : 1));
  });
  viewer?.addEventListener("click", (event) => {
    const rect = viewer.getBoundingClientRect();
    if (
      event.target === viewer &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      viewer.close();
  });
  viewer?.addEventListener("close", () => {
    document.body.classList.remove("photo-viewer-open");
    document.getElementById("photo-viewer-image").removeAttribute("src");
    viewerPhotos = [];
    viewerOpener?.focus({ preventScroll: true });
  });

  /** Рисует только локальные изображения из управляемой галереи. */
  function photoCard(photo, photos, index) {
    const card = el("figure", "photo-card");
    const img = el("img");
    img.src = photo.path;
    img.alt =
      photo.caption ||
      (photo.category === "work"
        ? "Работа мастера барбершопа Hunter"
        : "Атмосфера барбершопа Hunter");
    img.loading = "lazy";
    img.decoding = "async";
    const open = el("button", "photo-open");
    open.type = "button";
    open.setAttribute("aria-label", `Увеличить фото: ${img.alt}`);
    open.addEventListener("click", () => openPhotoViewer(photos, index, open));
    card.append(img, open);
    if (photo.caption) card.append(el("figcaption", "", photo.caption));
    return card;
  }

  /**
   * На компьютере сначала показывает шесть фото, остальные открывает кнопка.
   * На телефоне все фото доступны в одной ленте; точки остаются в одну строку.
   * База не изменяется: это только способ отображения существующих снимков.
   */
  function renderGallery(track, allPhotos, category) {
    const photos = allPhotos.filter(
      (photo) =>
        photo.category === category &&
        /^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(photo.path),
    );
    const more = document.querySelector(`[data-gallery-more="${track.id}"]`);
    const compact = matchMedia("(max-width: 1024px)");
    const cards = photos.map((photo, index) => photoCard(photo, photos, index));
    let visibleCount = 6;
    track.replaceChildren(
      ...(cards.length ? cards : [el("p", "loading-state", "Фотографии скоро появятся.")]),
    );
    if (category === "work") track.closest(".works-section").hidden = !cards.length;
    const update = () => {
      cards.forEach((card, index) => {
        card.hidden = !compact.matches && index >= visibleCount;
      });
      if (more) {
        more.hidden = compact.matches || visibleCount >= cards.length;
        more.textContent = `Показать ещё (${Math.max(0, Math.min(6, cards.length - visibleCount))})`;
      }
    };
    more?.addEventListener("click", () => {
      const firstNew = cards[visibleCount];
      visibleCount += 6;
      update();
      // Клавиатурный пользователь попадает к только что открытым фото.
      firstNew?.querySelector("button")?.focus({ preventScroll: true });
    });
    compact.addEventListener("change", update);
    update();
    if (cards.length) setupCarousel(track, { photos: true });
  }

  /** Подставляет одобренные отзывы и изображения; при пустой базе оставляет честное сообщение. */
  async function loadHomeExtras() {
    const work = document.getElementById("work-photos");
    const atmosphere = document.getElementById("atmosphere-photos");
    const reviews = document.getElementById("reviews-track");
    if (!work || !atmosphere || !reviews) return;
    try {
      const response = await fetch("/api/photos");
      if (!response.ok) throw Error("Фото недоступны");
      const photos = await response.json();
      renderGallery(work, photos, "work");
      renderGallery(atmosphere, photos, "atmosphere");
    } catch {
      work.replaceChildren(el("p", "loading-state", "Не удалось загрузить фотографии."));
      atmosphere.replaceChildren(el("p", "loading-state", "Не удалось загрузить фотографии."));
    }
    try {
      const response = await fetch("/api/reviews");
      if (!response.ok) throw Error("Отзывы недоступны");
      const items = await response.json();
      const cards = items.map((item) => {
        const card = el("article", "review-card");
        card.append(el("span", "review-stars", "★".repeat(item.rating)), el("p", "", item.text));
        const date = new Date(item.createdAt).toLocaleDateString("ru-RU", {
          month: "long",
          year: "numeric",
        });
        card.append(el("span", "caption", `${item.name} · ${date}`));
        return card;
      });
      reviews.replaceChildren(
        ...(cards.length
          ? cards
          : [el("p", "loading-state", "Пока нет опубликованных отзывов. Будьте первым.")]),
      );
      setupCarousel(reviews);
    } catch {
      reviews.replaceChildren(el("p", "loading-state", "Не удалось загрузить отзывы."));
    }
  }

  /** Показывает статистику всех опубликованных отзывов, включая старые. */
  async function loadReviewStats() {
    const host = document.getElementById("review-stats");
    if (!host) return;
    try {
      const response = await fetch("/api/reviews/stats");
      if (!response.ok) throw Error("Статистика недоступна");
      const { count, average } = await response.json();
      if (!count) {
        host.textContent = "Пока нет опубликованных отзывов.";
        return;
      }
      const endings = { one: "отзыв", few: "отзыва", many: "отзывов", other: "отзыва" };
      const word = endings[new Intl.PluralRules("ru").select(count)];
      const rating = new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(average);
      host.replaceChildren(
        el("strong", "review-stats-rating", `★ ${rating} / 5`),
        el("span", "review-stats-count", `${count} ${word}`),
      );
    } catch {
      host.textContent = "Статистика временно недоступна.";
    }
  }

  /** Отпечатки документов загружаются при каждом открытии формы. */
  const reviewForm = document.getElementById("review-form");
  const legalRetry = document.getElementById("review-legal-retry");
  let reviewRevision = 0;
  let reviewVersions = null;

  async function loadReviewVersions(preserveMessage = false) {
    if (!reviewForm) return;
    const revision = reviewRevision;
    const submit = reviewForm.querySelector('[type="submit"]');
    const message = document.getElementById("review-message");
    reviewVersions = null;
    submit.disabled = true;
    legalRetry.hidden = true;
    if (!preserveMessage) message.textContent = "Загружаем документы…";
    try {
      const response = await fetch("/api/legal/versions", { cache: "no-store" });
      if (!response.ok) throw Error("Не удалось загрузить документы.");
      const versions = await response.json();
      if (revision !== reviewRevision) return;
      reviewVersions = versions;
      if (!preserveMessage) message.textContent = "";
    } catch {
      if (revision === reviewRevision) {
        message.textContent = "Не удалось загрузить документы. Повторите попытку.";
        message.className = "form-message error";
        legalRetry.hidden = false;
      }
    } finally {
      if (revision === reviewRevision) submit.disabled = !reviewVersions;
    }
  }
  legalRetry?.addEventListener("click", () => loadReviewVersions());

  /** Обрабатывает отправку формы отзыва. */
  reviewForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!reviewForm.reportValidity() || !reviewVersions) return;
    const message = document.getElementById("review-message");
    const submit = reviewForm.querySelector('[type="submit"]');
    const values = new FormData(reviewForm);
    const data = {
      name: String(values.get("name") || "").trim(),
      rating: Number(values.get("rating")),
      text: String(values.get("text") || "").trim(),
      privacyAcknowledged: reviewForm.elements.namedItem("privacyAcknowledged").checked,
      processingConsent: reviewForm.elements.namedItem("processingConsent").checked,
      publicationConsent: reviewForm.elements.namedItem("publicationConsent").checked,
      publishName: reviewForm.elements.namedItem("publishName").checked,
      versions: reviewVersions,
    };
    const revision = reviewRevision;
    submit.disabled = true;
    message.className = "form-message";
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (revision !== reviewRevision) return;
      if (response.status === 409) {
        ["privacyAcknowledged", "processingConsent", "publicationConsent", "publishName"].forEach(
          (name) => {
            reviewForm.elements.namedItem(name).checked = false;
          },
        );
        message.textContent = result.error;
        message.classList.add("error");
        await loadReviewVersions(true);
        return;
      }
      if (!response.ok) throw Error(result.error || "Не удалось отправить отзыв.");
      reviewForm.reset();
      message.textContent = "Спасибо! Отзыв отправлен на проверку.";
      message.classList.add("success");
    } catch (error) {
      if (revision === reviewRevision) {
        message.textContent = error.message;
        message.classList.add("error");
      }
    } finally {
      if (revision === reviewRevision) submit.disabled = !reviewVersions;
    }
  });

  /** Обновляет телефон и показывает проверенные ссылки в разделе контактов. */
  async function loadContactLinks() {
    const networks = [
      {
        label: "WhatsApp",
        icon: "whatsapp",
        key: "whatsappUrl",
        hosts: ["wa.me"],
      },
      {
        label: "Telegram",
        icon: "telegram",
        key: "telegramUrl",
        hosts: ["t.me", "telegram.me"],
      },
      {
        label: "ВКонтакте",
        icon: "vk",
        key: "vkUrl",
        hosts: ["vk.ru", "www.vk.ru", "vk.com", "www.vk.com", "m.vk.com"],
      },
      {
        label: "МАКС",
        icon: "max",
        key: "maxUrl",
        hosts: ["max.ru"],
      },
      {
        label: "Instagram",
        icon: "instagram",
        key: "instagramUrl",
        hosts: ["instagram.com", "www.instagram.com"],
      },
    ];
    const contact = document.getElementById("contact-chat-links");
    const links = new Map();
    const addLink = (value, network) => {
      try {
        const url = new URL(value);
        if (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.port &&
          network.hosts.includes(url.hostname)
        ) {
          links.set(network.key, { ...network, url: url.href });
        }
      } catch {
        // Некорректный адрес пропускаем.
      }
    };
    try {
      const response = await fetch("/api/config");
      if (!response.ok) return;
      const config = await response.json();
      if (typeof config.phone === "string" && /^\+[1-9][0-9]{7,14}$/.test(config.phone)) {
        document.querySelectorAll("[data-phone-link]").forEach((link) => {
          link.href = "tel:" + config.phone;
        });
        document.querySelectorAll("[data-phone-text]").forEach((node) => {
          node.textContent = config.phoneDisplay || config.phone;
        });
      }
      networks.forEach((network) => {
        if (config[network.key]) addLink(config[network.key], network);
      });
    } catch {
      // При недоступных настройках не показываем непроверенные адреса.
      return;
    }

    const chatLink = ({ label, icon: iconName, url }) => {
      const link = el("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const icon = el("img");
      icon.src = `/images/${iconName}.svg`;
      icon.alt = "";
      link.append(icon, document.createTextNode(`${label} ↗`));
      return link;
    };
    const available = [...links.values()];
    if (contact && available.length) contact.replaceChildren(...available.map(chatLink));
  }

  const reviewToggle = document.getElementById("review-toggle");
  const reviewPanel = document.getElementById("review-form-panel");
  const reviewContent = reviewPanel?.querySelector(".review-form-wrap");
  let reviewFocusTimer;
  function setReviewOpen(open) {
    if (!reviewToggle || !reviewPanel) return;
    clearTimeout(reviewFocusTimer);
    reviewToggle.setAttribute("aria-expanded", String(open));
    reviewPanel.classList.toggle("open", open);
    reviewPanel.inert = !open;
    if (open) {
      loadReviewVersions();
      reviewFocusTimer = window.setTimeout(() => {
        // Не забираем фокус, если посетитель уже начал заполнять другое поле формы.
        if (!reviewPanel.contains(document.activeElement))
          reviewPanel.querySelector("input")?.focus();
      }, 250);
    } else {
      reviewRevision++;
      reviewVersions = null;
      if (legalRetry) legalRetry.hidden = true;
      reviewForm?.reset();
      const message = document.getElementById("review-message");
      if (message) {
        message.textContent = "";
        message.className = "form-message";
      }
    }
  }
  document.getElementById("review-close")?.addEventListener("click", () => {
    setReviewOpen(false);
    reviewToggle?.focus();
  });
  reviewToggle?.addEventListener("click", () => {
    setReviewOpen(reviewToggle.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("click", (event) => {
    if (
      reviewToggle?.getAttribute("aria-expanded") === "true" &&
      !reviewContent?.contains(event.target) &&
      // Настройки аналитики должны предупредить о перезагрузке до сброса отзыва.
      !event.target.closest(".metrics-settings, .metrics-banner") &&
      !reviewToggle.contains(event.target)
    ) {
      setReviewOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && reviewToggle?.getAttribute("aria-expanded") === "true") {
      setReviewOpen(false);
      reviewToggle.focus();
    }
  });
  window.addEventListener("pagehide", () => setReviewOpen(false));

  // При работе с полями нижняя панель не занимает место над экранной клавиатурой.
  document.addEventListener("focusin", (event) => {
    document.body.classList.toggle(
      "form-interacting",
      event.target.matches("input, textarea, select, .custom-select-trigger"),
    );
  });
  document.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      document.body.classList.toggle(
        "form-interacting",
        document.activeElement?.matches("input, textarea, select, .custom-select-trigger"),
      );
    });
  });

  loadCards();
  loadHomeExtras();
  loadReviewStats();
  loadContactLinks();
})();
