(() => {
type FieldSensitivity = "normal" | "sensitive" | "manual-only";

interface FillRequest {
  fieldId: string;
  value: string;
}

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return Math.abs(result).toString(36);
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
  if (element.labels?.length) {
    return Array.from(element.labels)
      .map((label) => label.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const ariaLabelledBy = textFromIds(element.getAttribute("aria-labelledby"));
  if (ariaLabelledBy) return ariaLabelledBy;

  const nearby = element.closest("label, div, li, fieldset")?.textContent?.trim();
  if (nearby && nearby.length < 180) return nearby;

  const placeholder =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.placeholder
      : "";
  return placeholder || element.name || element.id || "";
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

function fieldType(element: Element) {
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  if (element instanceof HTMLInputElement) {
    if (["email", "tel", "url", "number", "radio", "checkbox", "file", "password"].includes(element.type)) {
      return element.type;
    }
    return "text";
  }
  return "unknown";
}

const MANUAL_ONLY_TOKENS = [
  "ssn",
  "social security",
  "social security number",
  "date of birth",
  "dob",
  "birth date",
  "birthday",
  "password",
  "confirm password",
  "password confirmation",
];

function normalizeForClassification(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function classifySensitivity(
  label: string,
  name: string | undefined,
  id: string | undefined,
  type: string,
): FieldSensitivity {
  if (type === "password") return "manual-only";

  const searchText = normalizeForClassification([label, name, id].filter(Boolean).join(" "));

  for (const token of MANUAL_ONLY_TOKENS) {
    if (searchText.includes(token)) return "manual-only";
  }

  return "normal";
}

function fieldId(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const label = labelFor(element);
  const pathHash = hash(domPath(element));
  return hash([label, element.name, element.id, fieldType(element), pathHash].join("|"));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillElement(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  if (element instanceof HTMLInputElement && element.type === "file") return false;

  if (element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (element instanceof HTMLInputElement && ["radio", "checkbox"].includes(element.type)) {
    const group = element.name
      ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(element.name)}"]`))
      : [element];
    const match = group.find((input) => input.value === value || labelFor(input) === value);
    if (!match) return false;
    match.checked = true;
    match.dispatchEvent(new Event("input", { bubbles: true }));
    match.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  setNativeValue(element, value);
  return true;
}

function fillSelectedFields(fields: FillRequest[]) {
  const elements = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    ),
  );
  const results: Array<{ fieldId: string; filled: boolean; skipped?: string }> = [];

  for (const field of fields) {
    const element = elements.find((candidate) => fieldId(candidate) === field.fieldId);
    if (!element) {
      results.push({ fieldId: field.fieldId, filled: false });
      continue;
    }

    const type = fieldType(element);
    const label = labelFor(element);
    const sensitivity = classifySensitivity(label, element.name || undefined, element.id || undefined, type);

    if (sensitivity === "manual-only") {
      results.push({ fieldId: field.fieldId, filled: false, skipped: "manual-only" });
      continue;
    }

    results.push({
      fieldId: field.fieldId,
      filled: fillElement(element, field.value),
    });
  }

  return results;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FILL_SELECTED_FIELDS") return false;
  sendResponse({ results: fillSelectedFields(message.fields ?? []) });
  return true;
});
})();
