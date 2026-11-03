/** @file Панель управления: сеанс, формы, каталоги, отзывы, фото и документы. */
/** Инициализирует админку */
document.addEventListener("DOMContentLoaded", () => {
  const loginPanel = document.getElementById("login-panel");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("login-form");
  const status = document.getElementById("dashboard-message");
  let token = "";
  let sessionVersion = 0;
  const pendingRequests = new Set();

  /** Создаёт DOM-элемент с текстом */
  const el = (tag, value) => {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
  };

  /** Показывает панель входа или админку в зависимости от состояния авторизации */
  const show = (loggedIn) => {
    loginPanel.hidden = loggedIn;
    dashboard.hidden = !loggedIn;
  };

  /** Показывает сообщение внизу админки */
  const notify = (value) => {
    status.textContent = value;
  };

  /** Отменяет незавершённые запросы при выходе и не принимает ответы старого сеанса. */
  async function api(path, options = {}) {
    const version = sessionVersion;
    const requestToken = token;
    const controller = new AbortController();
    pendingRequests.add(controller);
    try {
      const response = await fetch(path, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
          ...options.headers,
        },
      });
      const body = await response.json().catch(() => ({}));
      if (version !== sessionVersion) throw Error("Запрос отменён после выхода из панели.");
      if (!response.ok) {
        if (response.status === 401 && requestToken) endSession();
        throw Error(body.error || "Не удалось выполнить запрос.");
      }
      return body;
    } finally {
      pendingRequests.delete(controller);
    }
  }

  /** Очищает память страницы и просит сервер закрыть текущий сеанс. */
  function endSession() {
    const previousToken = token;
    token = "";
    sessionVersion++;
    pendingRequests.forEach((controller) => controller.abort());
    pendingRequests.clear();
    resetAdminForms();
    cache.services = [];
    cache.masters = [];
    document
      .querySelectorAll("#admin-services, #admin-masters, #admin-reviews, #admin-photos")
      .forEach((host) => host.replaceChildren());
    show(false);
    if (previousToken) {
      // keepalive позволяет отправить выход и при переходе с панели на сайт.
      fetch("/api/admin/logout", {
        method: "POST",
        keepalive: true,
        headers: { Authorization: `Bearer ${previousToken}` },
      }).catch(() => {
        /* Без сети токен всё равно удалён из этой страницы и истечёт на сервере. */
      });
    }
  }

  const imageTypes = ["image/png", "image/jpeg", "image/webp"];
  const localImage = /^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/;

  function validImageFile(file) {
    return file && imageTypes.includes(file.type) && file.size > 0 && file.size <= 5 * 1024 * 1024;
  }

  /** Освобождает временный адрес предпросмотра перед показом другого снимка. */
  function showPreview(image, hint, source, caption) {
    if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
    delete image.dataset.objectUrl;
    if (source instanceof File) {
      image.src = URL.createObjectURL(source);
      image.dataset.objectUrl = image.src;
    } else if (localImage.test(source || "")) {
      image.src = source;
    } else {
      image.removeAttribute("src");
    }
    image.hidden = !image.hasAttribute("src");
    hint.textContent = caption;
  }

  /** Отправляет файл отдельным запросом после сохранения карточки мастера. */
  async function uploadMasterPhoto(masterId, file) {
    return api("/api/admin/masters/" + masterId + "/photo", {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
  }

  /** Обработчик отправки формы входа */
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = loginForm.querySelector('[type="submit"]');
    submit.disabled = true;
    const form = new FormData(loginForm);

    try {
      const body = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ login: form.get("login"), password: form.get("password") }),
      });

      token = body.token;
      loginForm.reset();
      document.getElementById("login-message").textContent = "";
      show(true);
      await loadAll();
    } catch (err) {
      document.getElementById("login-message").textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById("logout-button").addEventListener("click", endSession);

  /** Очищает незавершённые формы при выходе или переходе между разделами. */
  function resetAdminForms() {
    dashboard.querySelectorAll("form").forEach((form) => {
      form.reset();
      form.querySelectorAll('input[type="hidden"]').forEach((input) => {
        input.value = "";
      });
    });
    delete photoForm.dataset.originalPath;
    photoFileInput.required = true;
    document.getElementById("service-form-title").textContent = "Новая услуга";
    document.getElementById("master-form-title").textContent = "Новый мастер";
    document.getElementById("photo-form-title").textContent = "Новое фото";
    document.getElementById("photo-submit").textContent = "Добавить фото";
    showPreview(
      document.getElementById("master-photo-preview"),
      document.getElementById("master-photo-hint"),
      "",
      "Фото пока не выбрано",
    );
    showPreview(photoPreview, photoHint, "", "Выберите фото для загрузки");
    loginForm.reset();
    status.textContent = "";
    document.getElementById("contacts-message").textContent = "";
    document.getElementById("privacy-message").textContent = "";
    document.getElementById("processing-consent-message").textContent = "";
    document.getElementById("publication-consent-message").textContent = "";
    document.getElementById("login-message").textContent = "";
  }

  document.querySelectorAll('a[href="/"]').forEach((link) => {
    link.addEventListener("click", endSession);
  });
  window.addEventListener("pagehide", endSession);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) endSession();
  });

  /** Обработчик клика по вкладкам админки */
  document.querySelectorAll(".admin-tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.classList.contains("active")) resetAdminForms();
      document.querySelectorAll(".admin-tab").forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });

      ["services", "masters", "reviews", "photos", "contacts", "legal"].forEach((name) => {
        document.getElementById(`${name}-panel`).hidden = name !== button.dataset.tab;
      });
      button.focus();
    });
  });

  /** Загружает все данные для админки */
  async function loadAll() {
    await Promise.all([
      loadItems("services"),
      loadItems("masters"),
      loadReviews(),
      loadPhotos(),
      loadContacts(),
      loadPrivacy(),
      loadConsents(),
    ]);
  }

  /** Подключает одинаковые загрузку, сохранение и сброс для трёх юридических документов. */
  function setupLegalForm(formId, inputId, messageId, url, savedMessage) {
    const form = document.getElementById(formId);
    const input = document.getElementById(inputId);
    const message = document.getElementById(messageId);
    const setDisabled = (disabled) =>
      form.querySelectorAll("textarea, button").forEach((control) => {
        control.disabled = disabled;
      });
    const fill = (text) => {
      input.defaultValue = text;
      input.value = text;
    };
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      message.textContent = "Сохраняем…";
      try {
        const result = await api(url, {
          method: "PUT",
          body: JSON.stringify({ text: input.value }),
        });
        fill(result.text);
        message.textContent = savedMessage;
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    form.addEventListener("reset", () => {
      message.textContent = "";
    });
    return async () => {
      setDisabled(true);
      message.textContent = "Загружаем документ…";
      try {
        fill((await api(url)).text);
        setDisabled(false);
        message.textContent = "";
      } catch (error) {
        message.textContent = "Не удалось загрузить документ: " + error.message;
      }
    };
  }
  const loadPrivacy = setupLegalForm(
    "privacy-form",
    "privacy-text",
    "privacy-message",
    "/api/admin/privacy",
    "Политика сохранена.",
  );
  const consentLoaders = ["processing", "publication"].map((kind) =>
    setupLegalForm(
      kind + "-consent-form",
      kind + "-consent-text",
      kind + "-consent-message",
      "/api/admin/consents/" + kind,
      "Документ сохранён.",
    ),
  );
  async function loadConsents() {
    await Promise.all(consentLoaders.map((load) => load()));
  }

  const contactsForm = document.getElementById("contacts-form");
  const contactsMessage = document.getElementById("contacts-message");
  const contactFields = ["phone", "whatsappUrl", "telegramUrl", "vkUrl", "maxUrl", "instagramUrl"];

  /** Обновляет значения и исходное состояние формы для кнопки сброса. */
  function fillContacts(values) {
    contactFields.forEach((field) => {
      const input = contactsForm.elements.namedItem(field);
      input.defaultValue = values[field] || "";
      input.value = input.defaultValue;
    });
  }

  async function loadContacts() {
    contactsForm.querySelectorAll("input, button").forEach((element) => {
      element.disabled = true;
    });
    contactsMessage.textContent = "Загружаем контакты…";
    try {
      fillContacts(await api("/api/admin/contacts"));
      contactsForm.querySelectorAll("input, button").forEach((element) => {
        element.disabled = false;
      });
      contactsMessage.textContent = "";
    } catch (error) {
      contactsMessage.textContent = "Не удалось загрузить контакты: " + error.message;
    }
  }

  contactsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(
      contactFields.map((field) => [field, contactsForm.elements.namedItem(field).value.trim()]),
    );
    const submit = contactsForm.querySelector('[type="submit"]');
    submit.disabled = true;
    contactsMessage.textContent = "Сохраняем…";
    try {
      fillContacts(
        await api("/api/admin/contacts", { method: "PUT", body: JSON.stringify(values) }),
      );
      contactsMessage.textContent = "Контакты сохранены.";
    } catch (error) {
      contactsMessage.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  contactsForm.addEventListener("reset", () => {
    contactsMessage.textContent = "";
  });

  const config = {
    services: {
      fields: ["name", "category", "barberPrice", "topBarberPrice", "description"],
      label: "услугу",
    },
    masters: {
      fields: ["name", "role", "description", "photo"],
      label: "мастера",
    },
  };
  const cache = { services: [], masters: [] };
  const masterFileInput = document.getElementById("master-photo-file");
  masterFileInput.addEventListener("change", () => {
    const file = masterFileInput.files[0];
    if (file && !validImageFile(file)) {
      masterFileInput.value = "";
      notify("Выберите PNG, JPEG или WebP размером до 5 МБ.");
    }
    const selected = masterFileInput.files[0];
    const current = document.getElementById("master-photo-path").value;
    showPreview(
      document.getElementById("master-photo-preview"),
      document.getElementById("master-photo-hint"),
      selected || current,
      selected ? selected.name : current ? "Текущее фото" : "Фото пока не выбрано",
    );
  });

  /** Загружает список услуг или мастеров и отображает их в виде карточек */
  async function loadItems(kind) {
    try {
      cache[kind] = await api(`/api/admin/${kind}`);
      renderItems(kind);
    } catch (err) {
      notify(err.message);
    }
  }

  /** Отображает список услуг или мастеров в виде карточек */
  function renderItems(kind) {
    const host = document.getElementById(`admin-${kind}`);
    host.replaceChildren();

    if (!cache[kind].length) {
      host.append(el("p", "Пока нет записей."));
    }

    cache[kind].forEach((item) => {
      const card = el("article");
      card.className = "admin-card";

      const copy = el("div");
      copy.className = "admin-card-copy";
      const summary =
        kind === "services"
          ? [
              item.barberPrice != null ? `Барбер: ${item.barberPrice} ₽` : "",
              item.topBarberPrice != null ? `Топ-барбер: ${item.topBarberPrice} ₽` : "",
            ]
              .filter(Boolean)
              .join(" · ") || `Общая цена: ${item.price} ₽`
          : item.role;
      copy.append(
        el("strong", item.name),
        el("small", kind === "services" ? `${summary} · ${item.category}` : summary),
      );
      if (!item.isActive) copy.append(el("small", " · скрыто"));
      if (kind === "services" && item.isPopular) copy.append(el("small", " · популярное"));

      const main = el("div");
      main.className = "admin-card-main";
      if (kind === "masters" && localImage.test(item.photo || "")) {
        const portrait = el("img");
        portrait.className = "admin-master-thumb";
        portrait.src = item.photo;
        portrait.alt = "";
        main.append(portrait);
      }
      main.append(copy);

      const actions = el("div");
      actions.className = "admin-card-actions";

      const edit = el("button", "Изменить");
      edit.type = "button";
      edit.addEventListener("click", () => editItem(kind, item));

      const remove = el("button", "Удалить");
      remove.type = "button";
      remove.className = "danger";
      remove.addEventListener("click", async () => {
        if (!confirm(`Удалить ${config[kind].label} «${item.name}»?`)) return;

        try {
          await api(`/api/admin/${kind}/${item.id}`, {
            method: "DELETE",
          });
          await loadItems(kind);
          notify("Запись удалена.");
        } catch (err) {
          notify(err.message);
        }
      });

      actions.append(edit, remove);
      card.append(main, actions);
      host.append(card);
    });
  }

  /** Заполняет форму редактирования данными выбранной услуги или мастера */
  function editItem(kind, item) {
    const form = document.getElementById(kind === "services" ? "service-form" : "master-form");
    form.elements.namedItem("id").value = item.id;

    config[kind].fields.forEach((field) => {
      form.elements.namedItem(field).value = item[field] ?? "";
    });
    form.elements.namedItem("isActive").checked = Boolean(item.isActive);
    if (kind === "services") {
      form.elements.namedItem("isPopular").checked = Boolean(item.isPopular);
      const legacy = item.barberPrice == null && item.topBarberPrice == null;
      document.getElementById("service-price-hint").textContent = legacy
        ? `Сейчас общая цена: ${item.price} ₽. Можно сохранить её или указать цены по категориям мастеров.`
        : "Укажите хотя бы одну цену. Пустое поле означает, что мастер этой категории услугу не оказывает.";
      document.getElementById("service-price-error").textContent = "";
    }
    document.getElementById(
      kind === "services" ? "service-form-title" : "master-form-title",
    ).textContent = kind === "services" ? "Изменение услуги" : "Изменение мастера";
    if (kind === "masters") {
      masterFileInput.value = "";
      showPreview(
        document.getElementById("master-photo-preview"),
        document.getElementById("master-photo-hint"),
        item.photo,
        item.photo ? "Текущее фото. Выберите файл, чтобы заменить его." : "Фото пока не выбрано",
      );
    }
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    form.querySelector('input:not([type="hidden"])')?.focus();
  }

  for (const kind of ["services", "masters"]) {
    const form = document.getElementById(kind === "services" ? "service-form" : "master-form");

    /** Обработчик отправки формы редактирования услуги или мастера */
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const id = values.get("id");
      const data = { isActive: values.get("isActive") === "on" };
      if (kind === "services") data.isPopular = values.get("isPopular") === "on";

      config[kind].fields.forEach((field) => {
        data[field] = String(values.get(field) || "").trim();
      });
      if (kind === "services") {
        ["barberPrice", "topBarberPrice"].forEach((field) => {
          data[field] = data[field] === "" ? null : Number(data[field]);
        });
        const previous = cache.services.find((item) => String(item.id) === String(id));
        const keepLegacy =
          previous && previous.barberPrice == null && previous.topBarberPrice == null;
        if (data.barberPrice === null && data.topBarberPrice === null && !keepLegacy) {
          document.getElementById("service-price-error").textContent =
            "Укажите цену хотя бы для одной категории мастеров.";
          form.elements.namedItem("barberPrice").focus();
          return;
        }
        document.getElementById("service-price-error").textContent = "";
      }

      const portrait = kind === "masters" ? masterFileInput.files[0] : null;
      if (portrait && !validImageFile(portrait)) {
        notify("Выберите PNG, JPEG или WebP размером до 5 МБ.");
        return;
      }
      let savedItem;
      try {
        savedItem = await api(`/api/admin/${kind}${id ? `/${id}` : ""}`, {
          method: id ? "PUT" : "POST",
          body: JSON.stringify(data),
        });
        if (portrait) {
          form.elements.namedItem("id").value = savedItem.id;
          await uploadMasterPhoto(savedItem.id, portrait);
        }
        form.reset();
        form.elements.namedItem("id").value = "";
        await loadItems(kind);
        notify("Изменения сохранены.");
      } catch (err) {
        if (savedItem && portrait) {
          await loadItems(kind);
          notify("Карточка сохранена, но фото не загрузилось: " + err.message);
        } else {
          notify(err.message);
        }
      }
    });

    /** Обработчик сброса формы редактирования */
    form.addEventListener("reset", () => {
      setTimeout(() => {
        form.elements.namedItem("id").value = "";
        document.getElementById(
          kind === "services" ? "service-form-title" : "master-form-title",
        ).textContent = kind === "services" ? "Новая услуга" : "Новый мастер";
        if (kind === "services") {
          document.getElementById("service-price-hint").textContent =
            "Укажите хотя бы одну цену. Пустое поле означает, что мастер этой категории услугу не оказывает.";
          document.getElementById("service-price-error").textContent = "";
        }
        if (kind === "masters") {
          showPreview(
            document.getElementById("master-photo-preview"),
            document.getElementById("master-photo-hint"),
            "",
            "Фото пока не выбрано",
          );
        }
      }, 0);
    });
  }

  /** Показывает отзыв и позволяет сменить его видимость без вставки HTML из базы. */
  async function loadReviews() {
    const host = document.getElementById("admin-reviews");
    host.replaceChildren();
    try {
      const reviews = await api("/api/admin/reviews");
      if (!reviews.length) host.append(el("p", "Пока нет отзывов."));
      reviews.forEach((review) => {
        const card = el("article");
        card.className = "admin-review-card";
        const heading = el("div");
        heading.className = "admin-review-heading";
        heading.append(
          el("strong", review.name),
          el(
            "span",
            `${"★".repeat(review.rating)} · ${new Date(review.createdAt).toLocaleDateString("ru-RU")}`,
          ),
        );
        const consentDetails = el("details");
        consentDetails.className = "review-consent-details";
        const consentSummary = el(
          "summary",
          review.consent ? "Сведения о согласиях" : "Нет сохранённых сведений о согласиях",
        );
        consentDetails.append(consentSummary);
        if (review.consent) {
          const consentContent = el("pre", "Загружаем…");
          consentDetails.append(consentContent);
          consentDetails.addEventListener("toggle", async () => {
            if (!consentDetails.open || consentDetails.dataset.loaded) return;
            try {
              const data = await api("/api/admin/reviews/" + review.id + "/consent");
              consentContent.textContent =
                "Подтверждено: " +
                new Date(data.acceptedAt).toLocaleString("ru-RU") +
                "\nПубликация имени: " +
                (data.publishName ? "разрешена" : "не разрешена") +
                "\n\nПОЛИТИКА\n" +
                data.privacyText +
                "\n\nСОГЛАСИЕ НА ОБРАБОТКУ\n" +
                data.processingText +
                "\n\nСОГЛАСИЕ НА ПУБЛИКАЦИЮ\n" +
                data.publicationText;
              consentDetails.dataset.loaded = "true";
            } catch (error) {
              consentContent.textContent = error.message;
            }
          });
        }
        const content = el("p", review.text);
        const actions = el("div");
        actions.className = "admin-card-actions";
        const select = el("select");
        select.setAttribute("aria-label", `Статус отзыва №${review.id}`);
        [
          ["pending", "На проверке"],
          ["approved", "Опубликован"],
          ["rejected", "Отклонён"],
        ].forEach(([value, label]) => select.add(new Option(label, value)));
        select.value = review.status;
        select.addEventListener("change", async () => {
          try {
            await api(`/api/admin/reviews/${review.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: select.value }),
            });
            review.status = select.value;
            notify("Статус отзыва обновлён.");
          } catch (err) {
            select.value = review.status;
            select.dispatchEvent(new Event("input", { bubbles: true }));
            notify(err.message);
          }
        });
        const remove = el("button", "Удалить");
        remove.type = "button";
        remove.className = "danger";
        remove.addEventListener("click", async () => {
          if (!confirm("Удалить этот отзыв?")) return;
          try {
            await api(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
            await loadReviews();
            notify("Отзыв удалён.");
          } catch (err) {
            notify(err.message);
          }
        });
        actions.append(select, remove);
        card.append(heading, content, consentDetails, actions);
        host.append(card);
      });
    } catch (err) {
      notify(err.message);
    }
  }

  const photoForm = document.getElementById("photo-form");
  const photoFileInput = document.getElementById("photo-file");
  const photoPreview = document.getElementById("photo-current-preview");
  const photoHint = document.getElementById("photo-file-hint");

  function editPhoto(photo) {
    photoForm.elements.namedItem("id").value = photo.id;
    photoForm.elements.namedItem("category").value = photo.category;
    photoForm.elements.namedItem("category").dispatchEvent(new Event("input", { bubbles: true }));
    photoForm.elements.namedItem("caption").value = photo.caption;
    photoFileInput.value = "";
    photoFileInput.required = false;
    photoForm.dataset.originalPath = photo.path;
    document.getElementById("photo-form-title").textContent = "Изменение фотографии";
    document.getElementById("photo-submit").textContent = "Сохранить изменения";
    showPreview(photoPreview, photoHint, photo.path, "Текущее фото. Новый файл можно не выбирать.");
    photoForm.scrollIntoView({ behavior: "smooth", block: "start" });
    photoForm.elements.namedItem("caption").focus();
  }

  photoFileInput.addEventListener("change", () => {
    const file = photoFileInput.files[0];
    if (file && !validImageFile(file)) {
      photoFileInput.value = "";
      notify("Выберите PNG, JPEG или WebP размером до 5 МБ.");
    }
    const selected = photoFileInput.files[0];
    const current = photoForm.dataset.originalPath;
    showPreview(
      photoPreview,
      photoHint,
      selected || current,
      selected ? selected.name : current ? "Текущее фото" : "Выберите фото для загрузки",
    );
  });

  photoForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      photoForm.elements.namedItem("id").value = "";
      delete photoForm.dataset.originalPath;
      photoFileInput.required = true;
      document.getElementById("photo-form-title").textContent = "Новое фото";
      document.getElementById("photo-submit").textContent = "Добавить фото";
      showPreview(photoPreview, photoHint, "", "Выберите фото для загрузки");
    }, 0);
  });

  /** Выводит фотографии с кнопками изменения и удаления. */
  async function loadPhotos() {
    const host = document.getElementById("admin-photos");
    host.replaceChildren();
    try {
      const photos = await api("/api/admin/photos");
      if (!photos.length) host.append(el("p", "Пока нет фотографий."));
      photos.forEach((photo) => {
        const card = el("article");
        card.className = "admin-photo-card";
        if (/^\/images\/[a-zA-Z0-9/_-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(photo.path)) {
          const img = el("img");
          img.src = photo.path;
          img.alt =
            photo.caption ||
            (photo.category === "work" ? "Работа мастера" : "Атмосфера барбершопа");
          img.loading = "lazy";
          card.append(img);
        }
        const info = el("div");
        info.className = "admin-photo-copy";
        info.append(
          el("strong", photo.caption || "Фото без подписи"),
          el("small", photo.category === "work" ? "Работы мастеров" : "Атмосфера"),
        );
        const actions = el("div");
        actions.className = "admin-card-actions";
        const edit = el("button", "Изменить");
        edit.type = "button";
        edit.addEventListener("click", () => editPhoto(photo));
        const remove = el("button", "Удалить");
        remove.type = "button";
        remove.className = "danger";
        remove.addEventListener("click", async () => {
          if (!confirm(photo.caption ? `Удалить фото «${photo.caption}»?` : "Удалить фото?"))
            return;
          try {
            await api(`/api/admin/photos/${photo.id}`, { method: "DELETE" });
            await loadPhotos();
            notify("Фото удалено.");
          } catch (err) {
            notify(err.message);
          }
        });
        actions.append(edit, remove);
        info.append(actions);
        card.append(info);
        host.append(card);
      });
    } catch (err) {
      notify(err.message);
    }
  }

  document.getElementById("refresh-reviews").addEventListener("click", loadReviews);
  document.getElementById("refresh-photos").addEventListener("click", loadPhotos);
  photoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = photoForm.elements.namedItem("id").value;
    const file = photoFileInput.files[0];
    if ((!id && !file) || (file && !validImageFile(file))) {
      notify("Выберите PNG, JPEG или WebP размером до 5 МБ.");
      return;
    }

    const category = photoForm.elements.namedItem("category").value;
    const caption = photoForm.elements.namedItem("caption").value.trim();
    const query = new URLSearchParams({ category, caption });
    const button = document.getElementById("photo-submit");
    button.disabled = true;
    try {
      if (id && !file) {
        await api("/api/admin/photos/" + id, {
          method: "PUT",
          body: JSON.stringify({ category, caption }),
        });
      } else {
        const route = id
          ? "/api/admin/photos/" + id + "/file?" + query
          : "/api/admin/photos?" + query;
        await api(route, {
          method: id ? "PUT" : "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
      }
      photoForm.reset();
      await loadPhotos();
      notify(id ? "Фотография обновлена." : "Фото добавлено на сайт.");
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  });
});
