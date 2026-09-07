(() => {
  type FieldSensitivity = "normal" | "sensitive" | "manual-only";
  type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;
  type FillRequest = { fieldId: string; value: string };

  const availableFieldPolicy = (globalThis as typeof globalThis & {
    JobApplyAssistantFieldPolicy?: {
      classifySensitivity(label: string, name: string | undefined, id: string | undefined, type: string): FieldSensitivity;
    };
  }).JobApplyAssistantFieldPolicy;

  const availableControls = (globalThis as typeof globalThis & {
    JobApplyAssistantControls?: {
      controlName(element: SupportedControl): string;
      controlledOptions(element: SupportedControl): HTMLElement[];
      controls(): SupportedControl[];
      fieldId(element: SupportedControl): string;
      fieldType(element: SupportedControl): string;
      isCustomCombobox(element: Element): boolean;
      labelFor(element: SupportedControl): string;
    };
  }).JobApplyAssistantControls;

  if (!availableFieldPolicy || !availableControls) throw new Error("Job Apply Assistant field support was not loaded.");
  const fieldPolicy = availableFieldPolicy;
  const controls = availableControls;

  function normalize(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function yesNoToken(value: string) {
    const normalized = normalize(value);
    if (["yes", "y", "true"].includes(normalized)) return "yes";
    if (["no", "n", "false"].includes(normalized)) return "no";
    if (/\b(?:not|isn t|aren t)\b.*\bauthorized\b.*\bwork\b/.test(normalized)) return "no";
    if (/\bauthorized\b.*\bwork\b/.test(normalized)) return "yes";
    return null;
  }

  function equivalentValue(left: string, right: string) {
    const groups = [new Set(["us", "usa", "united states", "united states of america"])];
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    return groups.some((group) => group.has(normalizedLeft) && group.has(normalizedRight)) ||
      (yesNoToken(left) !== null && yesNoToken(left) === yesNoToken(right));
  }

  function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function optionMatches(option: HTMLElement, value: string) {
    const expected = normalize(value);
    return [
      option.dataset.optionValue,
      option.dataset.value,
      option.getAttribute("value"),
      option.getAttribute("aria-label"),
      option.textContent,
    ].some((candidate) => candidate && (normalize(candidate) === expected || equivalentValue(candidate, value)));
  }

  async function fillCustomCombobox(element: SupportedControl, value: string) {
    element.focus();
    element.click();
    if (element instanceof HTMLInputElement) setNativeValue(element, value);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const option = controls.controlledOptions(element).find((candidate) => optionMatches(candidate, value));
      if (option) {
        option.scrollIntoView?.({ block: "nearest" });
        option.click();
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return false;
  }

  async function fillElement(element: SupportedControl, value: string) {
    if (element instanceof HTMLInputElement && element.type === "file") return false;

    if (controls.isCustomCombobox(element)) return fillCustomCombobox(element, value);

    if (element instanceof HTMLSelectElement) {
      const normalizedValue = normalize(value);
      const option = Array.from(element.options).find(
        (candidate) => normalize(candidate.value) === normalizedValue || normalize(candidate.text) === normalizedValue,
      );
      if (!option) return false;
      element.value = option.value;
      if (element.value !== option.value) return false;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)) {
      const group = element.name
        ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(element.name)}"]`))
        : [element];
      const match = group.find((input) => normalize(input.value) === normalize(value) || normalize(controls.labelFor(input)) === normalize(value));
      if (!match) return false;
      match.checked = true;
      match.dispatchEvent(new Event("input", { bubbles: true }));
      match.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      setNativeValue(element, value);
      element.dispatchEvent(new Event("blur", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillSelectedFields(fields: FillRequest[]) {
    const elements = controls.controls();
    const results: Array<{ fieldId: string; filled: boolean; skipped?: string }> = [];

    for (const field of fields) {
      const element = elements.find((candidate) => controls.fieldId(candidate) === field.fieldId);
      if (!element) {
        results.push({ fieldId: field.fieldId, filled: false });
        continue;
      }

      const type = controls.fieldType(element);
      const label = controls.labelFor(element);
      const name = controls.controlName(element) || undefined;
      const sensitivity = fieldPolicy.classifySensitivity(label, name, element.id || undefined, type);
      if (sensitivity === "manual-only") {
        results.push({ fieldId: field.fieldId, filled: false, skipped: sensitivity });
        continue;
      }
      results.push({ fieldId: field.fieldId, filled: await fillElement(element, field.value) });
    }
    return results;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FILL_SELECTED_FIELDS") return false;
    void fillSelectedFields(message.fields ?? []).then((results) => sendResponse({ results }));
    return true;
  });
})();
