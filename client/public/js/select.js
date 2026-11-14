/** @file Списки выбора: клавиатура, состояние поля и размещение в пределах экрана. */

(() => {
  let nextId = 0;
  let openControl = null;

  /** Создаёт список внутри страницы, сохраняя исходный select для отправки формы.
   * @param {HTMLSelectElement} select - Исходный select
   */
  function enhance(select) {
    if (select.dataset.enhanced || select.multiple || select.size > 1) return;
    select.dataset.enhanced = "true";

    const id = ++nextId;
    const label =
      select.getAttribute("aria-label") ||
      select.labels?.[0]?.textContent.trim() ||
      "Выберите значение";

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    select.before(wrapper);
    wrapper.append(select);
    select.classList.add("custom-select-native");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "custom-select-trigger";
    button.setAttribute("role", "combobox");
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", `custom-options-${id}`);
    if (select.required) button.setAttribute("aria-required", "true");

    const list = document.createElement("div");
    list.className = "custom-select-list";
    list.id = `custom-options-${id}`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label);
    list.hidden = true;

    const error = document.createElement("span");
    error.className = "custom-select-error";
    error.id = `custom-error-${id}`;
    error.setAttribute("role", "alert");
    error.hidden = true;
    wrapper.append(button, list, error);

    let activeIndex = 0;
    const options = () => [...select.options];
    const items = () => [...list.children];
    const sync = () => {
      const selected = select.selectedOptions[0];
      const text = selected?.textContent.trim() || label;
      button.textContent = text;
      button.setAttribute("aria-label", `${label}: ${text}`);
      button.disabled = select.disabled;
      if (select.required) button.setAttribute("aria-required", "true");
      else button.removeAttribute("aria-required");
      items().forEach((item, index) => {
        item.setAttribute("aria-selected", String(index === select.selectedIndex));
        item.setAttribute("aria-disabled", String(select.options[index]?.disabled));
      });
      if (select.validity.valid) {
        button.removeAttribute("aria-invalid");
        button.removeAttribute("aria-describedby");
        error.hidden = true;
      }
    };

    /** Устанавливает активный элемент в списке. */
    const setActive = (index) => {
      const choices = options();
      if (!choices.length) return;
      activeIndex = Math.max(0, Math.min(index, choices.length - 1));
      items().forEach((item, i) => item.classList.toggle("active", i === activeIndex));
      const active = items()[activeIndex];
      if (active) {
        button.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      }
    };

    /** Закрывает список. */
    const close = () => {
      list.hidden = true;
      wrapper.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      button.removeAttribute("aria-activedescendant");
      if (openControl === control) openControl = null;
    };

    /** Выбирает элемент в списке. */
    const choose = (index) => {
      const option = options()[index];
      if (!option || option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
      close();
      button.focus();
    };

    /** Размещает список в пределах видимой области экрана. */
    const positionList = () => {
      if (list.hidden) return;
      wrapper.classList.remove("opens-up");
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop || 0;
      const bottom = top + (viewport?.height || window.innerHeight);
      if (
        rect.top < top ||
        rect.bottom > bottom ||
        rect.left < 0 ||
        rect.right > window.innerWidth
      ) {
        close();
        return;
      }
      const below = Math.max(0, bottom - rect.bottom - 12);
      const above = Math.max(0, rect.top - top - 12);
      const upwards = below < Math.min(list.scrollHeight, 240) && above > below;
      wrapper.classList.toggle("opens-up", upwards);
      list.style.maxHeight = `${Math.max(48, Math.min(240, upwards ? above : below))}px`;
    };

    /** Открывает список. */
    const open = () => {
      if (button.disabled) return;
      if (openControl && openControl !== control) openControl.close();
      list.hidden = false;
      wrapper.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      openControl = control;
      positionList();
      setActive(select.selectedIndex < 0 ? 0 : select.selectedIndex);
    };

    /** Возвращает объект управления списком. */
    const control = { wrapper, close, positionList };

    /** Перестраивает список при изменении исходного select. */
    function rebuild() {
      list.replaceChildren();
      options().forEach((option, index) => {
        const item = document.createElement("div");
        item.id = `custom-option-${id}-${index}`;
        item.className = "custom-select-option";
        item.setAttribute("role", "option");
        item.setAttribute("aria-disabled", String(option.disabled));
        item.textContent = option.textContent;
        item.addEventListener("click", () => choose(index));
        list.append(item);
      });
      sync();
    }

    button.addEventListener("click", () => {
      if (list.hidden) open();
      else close();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !list.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === "Tab") {
        close();
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) open();
        else {
          const last = options().length - 1;
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : activeIndex + (event.key === "ArrowDown" ? 1 : -1);
          setActive(next);
        }
      } else if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (list.hidden) open();
        else choose(activeIndex);
      }
    });
    list.addEventListener("mousedown", (event) => event.preventDefault());
    select.addEventListener("change", sync);
    select.addEventListener("input", sync);
    select.addEventListener("invalid", (event) => {
      event.preventDefault();
      button.setAttribute("aria-invalid", "true");
      button.setAttribute("aria-describedby", error.id);
      error.textContent = "Выберите значение.";
      error.hidden = false;
      button.focus();
    });
    select.form?.addEventListener("reset", () => {
      window.setTimeout(() => {
        button.removeAttribute("aria-invalid");
        button.removeAttribute("aria-describedby");
        error.hidden = true;
        close();
        sync();
      }, 0);
    });
    select.labels?.[0]?.addEventListener("click", (event) => {
      event.preventDefault();
      button.focus();
    });
    new MutationObserver((changes) => {
      if (changes.some((change) => change.type === "childList")) rebuild();
      else sync();
    }).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "required"],
    });
    rebuild();
  }

  /** Инициализация всех select на странице и отслеживание добавления новых. */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("select").forEach(enhance);
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) =>
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches("select")) enhance(node);
          node.querySelectorAll("select").forEach(enhance);
        }),
      );
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (event) => {
      if (openControl && !openControl.wrapper.contains(event.target)) openControl.close();
    });
    const reposition = () => {
      openControl?.positionList();
      requestAnimationFrame(() => openControl?.positionList());
    };
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
  });
})();
