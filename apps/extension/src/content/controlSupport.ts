(() => {
  type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
  type FieldOption = { label: string; value: string };

  function normalize(value: string) {
    return value.replace(/\s+/g, " ").trim();
  }

  function isNativeControl(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
  }

  function isCustomCombobox(element: Element) {
    return element.getAttribute("role") === "combobox" && !(element instanceof HTMLSelectElement);
  }

  function isVisible(element: HTMLElement) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function controlName(element: SupportedControl) {
    return isNativeControl(element)
      ? element.name || element.dataset.name || element.id || ""
      : element.dataset.name || element.getAttribute("name") || element.id || "";
  }

  function textFromIds(ids: string | null) {
    if (!ids) return "";
    return normalize(ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
  }

  function textWithoutControls(container: Element) {
    const clone = container.cloneNode(true) as Element;
    clone.querySelectorAll("input, textarea, select, button, [role='combobox'], [role='listbox'], [role='option'], script, style")
      .forEach((element) => element.remove());
    return normalize(clone.textContent ?? "");
  }

  function concise(value: string) {
    const normalized = normalize(value);
    return normalized.length > 0 && normalized.length <= 140 ? normalized : "";
  }

  function labelFor(element: SupportedControl) {
    const ariaLabel = concise(element.getAttribute("aria-label") ?? "");
    if (ariaLabel) return ariaLabel;

    const ariaLabelledBy = concise(textFromIds(element.getAttribute("aria-labelledby")));
    if (ariaLabelledBy) return ariaLabelledBy;

    if (isNativeControl(element) && element.labels?.length) {
      for (const label of Array.from(element.labels)) {
        const controls = label.querySelectorAll("input, textarea, select, [role='combobox']");
        if (!label.htmlFor && controls.length > 1) continue;
        const text = concise(textWithoutControls(label));
        if (text) return text;
      }
    }

    const fieldContainer = element.closest("[data-field], .form-field, .form-group, .field, fieldset");
    const containerLabel = fieldContainer?.querySelector("label, legend, [data-label], .field-label");
    if (containerLabel) {
      const text = concise(textWithoutControls(containerLabel));
      if (text) return text;
    }

    const previous = element.previousElementSibling;
    if (previous) {
      const text = concise(textWithoutControls(previous));
      if (text) return text;
    }

    const placeholder = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? concise(element.placeholder)
      : "";
    return placeholder || controlName(element);
  }

  function hash(value: string) {
    let result = 0;
    for (let index = 0; index < value.length; index += 1) {
      result = (result << 5) - result + value.charCodeAt(index);
      result |= 0;
    }
    return Math.abs(result).toString(36);
  }

  function domPath(element: Element) {
    const parts: string[] = [];
    let current: Element | null = element;
    while (current && parts.length < 6) {
      const parent: Element | null = current.parentElement;
      const index = parent ? Array.from(parent.children).indexOf(current) : 0;
      parts.unshift(`${current.tagName.toLowerCase()}:${index}`);
      current = parent;
    }
    return parts.join("/");
  }

  function fieldType(element: SupportedControl) {
    if (isCustomCombobox(element)) return "select";
    if (element instanceof HTMLTextAreaElement) return "textarea";
    if (element instanceof HTMLSelectElement) return "select";
    if (element instanceof HTMLInputElement) {
      if (["email", "tel", "url", "number", "radio", "checkbox", "file", "password", "date"].includes(element.type)) {
        return element.type;
      }
      return "text";
    }
    return "unknown";
  }

  function controlledOptions(element: SupportedControl) {
    const controlled = element.getAttribute("aria-controls") || element.getAttribute("aria-owns");
    const root = controlled ? document.getElementById(controlled) : element.closest("[data-field], .form-field, .form-group, .field");
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>("[role='option'], [data-option-value]"));
  }

  function optionsFor(element: SupportedControl): FieldOption[] | null {
    if (element instanceof HTMLSelectElement) {
      return Array.from(element.options).map((option) => ({
        label: option.label || option.textContent?.trim() || option.value,
        value: option.value,
      }));
    }

    if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)) {
      const name = element.name;
      if (!name) return null;
      return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`))
        .filter((input) => input.type === element.type)
        .map((input) => ({ label: labelFor(input), value: input.value }));
    }

    if (isCustomCombobox(element)) {
      const options = controlledOptions(element).map((option) => ({
        label: concise(option.getAttribute("aria-label") ?? option.textContent ?? ""),
        value: option.dataset.optionValue || option.dataset.value || option.getAttribute("value") || concise(option.textContent ?? ""),
      })).filter((option) => option.label && option.value);
      return options.length ? options : null;
    }

    return null;
  }

  function controls() {
    return Array.from(document.querySelectorAll<SupportedControl>("input, textarea, select, [role='combobox']"))
      .filter((element, index, all) => all.indexOf(element) === index)
      .filter((element) => !isCustomCombobox(element) || isNativeControl(element) || !element.querySelector("input, textarea, select, [role='combobox']"));
  }

  function fieldId(element: SupportedControl) {
    return hash([labelFor(element), controlName(element), element.id, fieldType(element), hash(domPath(element))].join("|"));
  }

  const target = globalThis as typeof globalThis & { JobApplyAssistantControls?: unknown };
  target.JobApplyAssistantControls = {
    controlName,
    controls,
    controlledOptions,
    fieldId,
    fieldType,
    isCustomCombobox,
    isNativeControl,
    isVisible,
    labelFor,
    optionsFor,
  };
})();
