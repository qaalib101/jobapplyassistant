(() => {
  type FieldSensitivity = "normal" | "sensitive" | "manual-only";

  type FieldCategory =
    | "contact"
    | "personal"
    | "work"
    | "demographic"
    | "eeo"
    | "disability"
    | "veteran"
    | "gender"
    | "race"
    | "unknown";

  interface FieldOption {
    label: string;
    value: string;
  }

  interface FieldMetadata {
    fieldId: string;
    label?: string;
    name?: string;
    id?: string;
    type: string;
    placeholder?: string;
    required?: boolean;
    options?: FieldOption[] | null;
    domPathHash?: string;
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

if (!availableFieldPolicy) throw new Error("Job Apply Assistant field policy was not loaded.");
const fieldPolicy = availableFieldPolicy;

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function textFromIds(ids: string | null) {
  if (!ids) return "";
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function labelFor(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  // 1. Associated <label> elements (most reliable)
  if (element.labels?.length) {
    const labelText = Array.from(element.labels)
      .map((label) => label.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (labelText) return labelText;
  }

  // 2. aria-label attribute
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  // 3. aria-labelledby attribute
  const ariaLabelledBy = textFromIds(element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) return ariaLabelledBy;

  // 4. Fieldset/legend pattern
  const fieldset = element.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend?.textContent?.trim()) {
      return legend.textContent.trim();
    }
  }

  // 5. Preceding sibling text (common in form layouts)
  const previousSibling = element.previousElementSibling;
  if (previousSibling) {
    const siblingText = previousSibling.textContent?.trim() ?? "";
    if (siblingText && siblingText.length < 120 && isLikelyLabel(siblingText)) {
      return siblingText;
    }
  }

  // 6. Parent's direct text content (not descendant text)
  const parent = element.parentElement;
  if (parent) {
    const parentDirectText = getDirectTextContent(parent);
    if (parentDirectText && parentDirectText.length < 120 && isLikelyLabel(parentDirectText)) {
      return parentDirectText;
    }
  }

  // 7. Nearby container text (fallback)
  const nearby = element.closest("label, div, li, fieldset")?.textContent?.trim();
  if (nearby && nearby.length < 180) return nearby;

  // 8. Placeholder, name, id (last resort)
  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : "";
  return placeholder || element.name || element.id || "";
}

function isLikelyLabel(text: string): boolean {
  // Heuristic: labels are typically short, don't contain too many words,
  // and often end with a colon or are a single phrase
  if (text.length > 100) return false;
  if (text.includes("\n") && text.split("\n").length > 3) return false;
  return true;
}

function getDirectTextContent(element: Element): string {
  let text = "";
  const childNodes = Array.from(element.childNodes);
  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent?.trim() ?? "";
    }
  }
  return text.trim();
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

function optionsFor(element: Element): FieldOption[] | null {
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
      .map((input) => ({
        label: labelFor(input),
        value: input.value,
      }));
  }

  return null;
}

function fieldType(element: Element) {
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

function scanVisibleFields(): FieldMetadata[] {
  const elements = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    ),
  );

  const seenGroups = new Set<string>();

  return elements
    .filter(
      (element) =>
        !element.disabled &&
        !(element instanceof HTMLInputElement &&
          ["hidden", "submit", "button", "image", "reset"].includes(element.type)) &&
        isVisible(element),
    )
    .filter((element) => {
      if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)) {
        const groupKey = `${element.type}:${element.name || element.id}`;
        if (seenGroups.has(groupKey)) return false;
        seenGroups.add(groupKey);
      }
      return true;
    })
    .map((element) => {
      const label = labelFor(element);
      const pathHash = hash(domPath(element));
      const required =
        element instanceof HTMLInputElement && element.type === "radio" && element.name
          ? Array.from(
              document.querySelectorAll<HTMLInputElement>(
                `input[name="${CSS.escape(element.name)}"]`,
              ),
            ).some((el) => el.required)
          : element.required;
      const type = fieldType(element);
      const currentValue =
        element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)
          ? undefined
          : element.value || undefined;
      const checked =
        element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)
          ? element.checked
          : undefined;
      return {
        fieldId: hash([label, element.name, element.id, type, pathHash].join("|")),
        label,
        name: element.name || undefined,
        id: element.id || undefined,
        type,
        placeholder: "placeholder" in element ? element.placeholder || undefined : undefined,
        required,
        options: optionsFor(element),
        domPathHash: pathHash,
        visible: true,
        sensitivity: fieldPolicy.classifySensitivity(label, element.name || undefined, element.id || undefined, type),
        category: fieldPolicy.classifyCategory(label, element.name || undefined, element.id || undefined),
        currentValue,
        checked,
      };
    });
}

function visiblePageText() {
  return (document.body?.innerText ?? "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 60000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN_VISIBLE_FIELDS") return false;
  sendResponse({
    pageUrl: window.location.href,
    pageTitle: document.title,
    fields: scanVisibleFields(),
    visibleText: visiblePageText(),
  });
  return true;
});
})();
