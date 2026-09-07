(() => {
  type FieldSensitivity = "normal" | "sensitive" | "manual-only";
  type FieldCategory = "contact" | "personal" | "work" | "demographic" | "eeo" | "disability" | "veteran" | "gender" | "race" | "unknown";
  type FieldOption = { label: string; value: string };
  type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

  interface FieldMetadata {
    fieldId: string;
    label?: string;
    name?: string;
    id?: string;
    type: string;
    placeholder?: string;
    required?: boolean;
    options?: FieldOption[] | null;
    visible?: boolean;
    currentValue?: string;
    checked?: boolean;
    sensitivity?: FieldSensitivity;
    category?: FieldCategory;
  }

  const availableFieldPolicy = (globalThis as typeof globalThis & {
    JobApplyAssistantFieldPolicy?: {
      classifySensitivity(label: string, name: string | undefined, id: string | undefined, type: string): FieldSensitivity;
      classifyCategory(label: string, name: string | undefined, id: string | undefined): FieldCategory;
    };
  }).JobApplyAssistantFieldPolicy;

  const availableControls = (globalThis as typeof globalThis & {
    JobApplyAssistantControls?: {
      controlName(element: SupportedControl): string;
      controls(): SupportedControl[];
      fieldId(element: SupportedControl): string;
      fieldType(element: SupportedControl): string;
      isVisible(element: HTMLElement): boolean;
      labelFor(element: SupportedControl): string;
      optionsFor(element: SupportedControl): FieldOption[] | null;
    };
  }).JobApplyAssistantControls;

  if (!availableFieldPolicy || !availableControls) throw new Error("Job Apply Assistant field support was not loaded.");
  const fieldPolicy = availableFieldPolicy;
  const controls = availableControls;

  function scanVisibleFields(): FieldMetadata[] {
    const seenGroups = new Set<string>();

    return controls.controls()
      .filter((element) => {
        if (!controls.isVisible(element)) return false;
        if ("disabled" in element && element.disabled) return false;
        return !(element instanceof HTMLInputElement && ["hidden", "submit", "button", "image", "reset"].includes(element.type));
      })
      .filter((element) => {
        if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)) {
          const groupKey = `${element.type}:${element.name || element.id}`;
          if (seenGroups.has(groupKey)) return false;
          seenGroups.add(groupKey);
        }
        return true;
      })
      .map((element) => {
        const label = controls.labelFor(element);
        const name = controls.controlName(element) || undefined;
        const type = controls.fieldType(element);
        const required = element instanceof HTMLInputElement && element.type === "radio" && element.name
          ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(element.name)}"]`)).some((item) => item.required)
          : "required" in element
            ? Boolean(element.required)
            : element.getAttribute("aria-required") === "true";
        const currentValue = element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)
          ? undefined
          : element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? element.value || undefined
            : element.dataset.value || element.getAttribute("aria-valuetext") || undefined;
        const checked = element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)
          ? element.checked
          : undefined;

        return {
          fieldId: controls.fieldId(element),
          label,
          name,
          id: element.id || undefined,
          type,
          placeholder: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? element.placeholder || undefined
            : undefined,
          required,
          options: controls.optionsFor(element),
          visible: true,
          sensitivity: fieldPolicy.classifySensitivity(label, name, element.id || undefined, type),
          category: fieldPolicy.classifyCategory(label, name, element.id || undefined),
          currentValue,
          checked,
        };
      });
  }

  function visiblePageText() {
    return (document.body?.innerText ?? "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 60000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SCAN_VISIBLE_FIELDS") return false;
    sendResponse({ pageUrl: window.location.href, pageTitle: document.title, fields: scanVisibleFields(), visibleText: visiblePageText() });
    return true;
  });
})();
