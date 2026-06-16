interface FieldMetadata {
  fieldId: string;
  label?: string;
  name?: string;
  id?: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ label: string; value: string }> | null;
  domPathHash?: string;
  visible?: boolean;
}

interface Suggestion {
  fieldId: string;
  fieldLabel?: string;
  fieldType: string;
  suggestedValue: string;
  confidence: number;
  sourceType: string;
  sourceContext: Record<string, unknown>;
  provider?: string;
  model?: string;
  isGenerated: boolean;
  requiresUserReview: true;
}

interface ScanResult {
  pageUrl: string;
  pageTitle: string;
  fields: FieldMetadata[];
}

interface ApplicationSession {
  id: string;
  company?: string;
  role?: string;
  ats_domain?: string;
  current_step?: string;
}

let activeTabId: number | undefined;
let activeSession: ApplicationSession | undefined;
let pageSnapshotId: string | undefined;
let suggestions: Suggestion[] = [];
let detectedFields: FieldMetadata[] = [];

const scanButton = document.querySelector<HTMLButtonElement>("#scanButton");
const fillButton = document.querySelector<HTMLButtonElement>("#fillButton");
const collapseButton = document.querySelector<HTMLButtonElement>("#collapseButton");
const expandButton = document.querySelector<HTMLButtonElement>("#expandButton");
const selectHighConfidenceButton = document.querySelector<HTMLButtonElement>(
  "#selectHighConfidenceButton",
);
const clearSelectionButton = document.querySelector<HTMLButtonElement>("#clearSelectionButton");
const collapsedView = document.querySelector<HTMLElement>("#collapsedView");
const expandedView = document.querySelector<HTMLElement>("#expandedView");
const statusElement = document.querySelector<HTMLElement>("#status");
const sessionElement = document.querySelector<HTMLElement>("#session");
const sessionText = document.querySelector<HTMLElement>("#sessionText");
const suggestionsForm = document.querySelector<HTMLFormElement>("#suggestionsForm");
const suggestionsElement = document.querySelector<HTMLElement>("#suggestions");

function setStatus(text: string) {
  if (statusElement) statusElement.textContent = text;
}

async function setCollapsed(collapsed: boolean) {
  document.body.classList.toggle("collapsed", collapsed);
  if (collapsedView) collapsedView.hidden = !collapsed;
  if (expandedView) expandedView.hidden = collapsed;
  await chrome.storage.local.set({ sidePanelCollapsed: collapsed });
}

async function restoreCollapsedState() {
  const stored = await chrome.storage.local.get("sidePanelCollapsed");
  await setCollapsed(Boolean(stored.sidePanelCollapsed));
}

async function backendBaseUrl() {
  const stored = await chrome.storage.local.get("backendBaseUrl");
  return stored.backendBaseUrl || "http://jobapply.localhost:8080";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await backendBaseUrl();
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab found.");
  activeTabId = tab.id;
  return tab;
}

function hostPatternForUrl(tabUrl?: string) {
  if (!tabUrl) {
    throw new Error(
      "Chrome did not expose this tab URL. Reload the extension after rebuilding, then open the job page tab and click the extension icon from that tab.",
    );
  }
  const url = new URL(tabUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("The extension can only scan http and https pages.");
  }
  return `${url.protocol}//${url.host}/*`;
}

async function ensurePagePermission(tab: chrome.tabs.Tab) {
  const origin = hostPatternForUrl(tab.url);
  const alreadyGranted = await chrome.permissions.contains({ origins: [origin] });
  if (alreadyGranted) return;

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error(`Permission is required to scan ${origin}`);
  }
}

async function ensureContentScripts(tabId: number) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/scanner.js", "content/filler.js"],
  });
}

function renderSession(session: ApplicationSession) {
  if (!sessionElement || !sessionText) return;
  sessionElement.hidden = false;
  sessionText.textContent = [session.company, session.role, session.ats_domain]
    .filter(Boolean)
    .join(" · ") || session.current_step || session.id;
}

function renderSuggestions() {
  if (!suggestionsForm || !suggestionsElement) return;
  suggestionsForm.hidden = suggestions.length === 0;
  suggestionsElement.replaceChildren();

  for (const suggestion of suggestions) {
    const row = document.createElement("label");
    row.className = "suggestion";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "field";
    checkbox.value = suggestion.fieldId;
    checkbox.checked = suggestion.confidence >= 0.9 && !suggestion.isGenerated;

    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "field-label";
    title.textContent = suggestion.fieldLabel || suggestion.fieldId;

    const value =
      suggestion.fieldType === "textarea"
        ? document.createElement("textarea")
        : document.createElement("input");
    value.className = "value";
    value.dataset.fieldId = suggestion.fieldId;
    value.value = suggestion.suggestedValue;
    if (value instanceof HTMLInputElement) {
      value.type = "text";
    }

    const source = document.createElement("div");
    source.className = "source";
    const confidence = Math.round(suggestion.confidence * 100);
    source.textContent = `${suggestion.sourceType} · ${confidence}% confidence${
      suggestion.isGenerated ? " · generated draft" : ""
    }`;

    body.append(title, value, source);
    if (suggestion.isGenerated) {
      const warning = document.createElement("div");
      warning.className = "generated-warning";
      warning.textContent = "Generated draft. Edit and review before filling.";
      body.append(warning);
    }
    row.append(checkbox, body);
    suggestionsElement.append(row);
  }

  const suggestedFieldIds = new Set(suggestions.map((suggestion) => suggestion.fieldId));
  for (const field of detectedFields.filter((item) => !suggestedFieldIds.has(item.fieldId))) {
    const row = document.createElement("div");
    row.className = "suggestion muted";

    const spacer = document.createElement("span");
    const body = document.createElement("div");
    const title = document.createElement("div");
    title.className = "field-label";
    title.textContent = field.label || field.name || field.fieldId;

    const source = document.createElement("div");
    source.className = "source";
    source.textContent = "Detected field · no saved suggestion";

    body.append(title, source);
    row.append(spacer, body);
    suggestionsElement.append(row);
  }
}

function reviewedValue(fieldId: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `.value[data-field-id="${CSS.escape(fieldId)}"]`,
  );
  return input?.value ?? "";
}

function setAllSelections(selected: boolean) {
  document
    .querySelectorAll<HTMLInputElement>('input[name="field"]')
    .forEach((input) => {
      input.checked = selected;
    });
}

function selectHighConfidence() {
  document
    .querySelectorAll<HTMLInputElement>('input[name="field"]')
    .forEach((input) => {
      const suggestion = suggestions.find((item) => item.fieldId === input.value);
      input.checked = Boolean(suggestion && suggestion.confidence >= 0.85 && !suggestion.isGenerated);
    });
}

async function scanPage() {
  if (!scanButton) return;
  scanButton.disabled = true;
  setStatus("Scanning visible fields...");

  try {
    const tab = await activeTab();
    await ensurePagePermission(tab);
    await ensureContentScripts(tab.id!);
    const scan = await chrome.tabs.sendMessage<unknown, ScanResult>(tab.id!, {
      type: "SCAN_VISIBLE_FIELDS",
    });
    detectedFields = scan.fields;

    setStatus(`Found ${scan.fields.length} visible fields. Resolving session...`);

    activeSession = await api<ApplicationSession>("/application-sessions/resolve", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: scan.pageUrl,
        pageTitle: scan.pageTitle,
      }),
    });
    renderSession(activeSession);

    const snapshot = await api<{ id: string }>(
      `/application-sessions/${activeSession.id}/page-snapshots`,
      {
        method: "POST",
        body: JSON.stringify({
          pageUrl: scan.pageUrl,
          pageTitle: scan.pageTitle,
          fields: scan.fields,
        }),
      },
    );
    pageSnapshotId = snapshot.id;

    const response = await api<{ suggestions: Suggestion[] }>(
      `/application-sessions/${activeSession.id}/suggestions`,
      {
        method: "POST",
        body: JSON.stringify({
          pageSnapshotId,
          fields: scan.fields,
        }),
      },
    );
    suggestions = response.suggestions;
    renderSuggestions();
    setStatus(
      suggestions.length
        ? "Review suggestions and select fields to fill."
        : `Found ${scan.fields.length} fields, but no suggestions yet.`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Scan failed.");
  } finally {
    scanButton.disabled = false;
  }
}

async function fillSelected(event: SubmitEvent) {
  event.preventDefault();
  if (!activeTabId || !activeSession || !pageSnapshotId) return;

  const selected = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="field"]:checked'),
  ).map((input) => input.value);
  const selectedSuggestions = suggestions.filter((suggestion) =>
    selected.includes(suggestion.fieldId),
  );
  if (!selectedSuggestions.length) {
    setStatus("Select at least one suggestion to fill.");
    return;
  }

  fillButton?.setAttribute("disabled", "true");
  setStatus("Filling selected fields...");

  try {
    await chrome.tabs.sendMessage(activeTabId, {
      type: "FILL_SELECTED_FIELDS",
      fields: selectedSuggestions.map((suggestion) => ({
        fieldId: suggestion.fieldId,
        value: reviewedValue(suggestion.fieldId),
      })),
    });

    await api(`/application-sessions/${activeSession.id}/filled-fields`, {
      method: "POST",
      body: JSON.stringify({
        pageSnapshotId,
        fields: selectedSuggestions.map((suggestion) => ({
          fieldId: suggestion.fieldId,
          fieldLabel: suggestion.fieldLabel,
          filledValue: reviewedValue(suggestion.fieldId),
        })),
      }),
    });

    setStatus("Selected fields filled. Review the page before continuing.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Fill failed.");
  } finally {
    fillButton?.removeAttribute("disabled");
  }
}

scanButton?.addEventListener("click", scanPage);
suggestionsForm?.addEventListener("submit", fillSelected);
collapseButton?.addEventListener("click", () => setCollapsed(true));
expandButton?.addEventListener("click", () => setCollapsed(false));
selectHighConfidenceButton?.addEventListener("click", selectHighConfidence);
clearSelectionButton?.addEventListener("click", () => setAllSelections(false));
restoreCollapsedState();
