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
  visibleText?: string;
}

interface ApplicationSession {
  id: string;
  company?: string;
  role?: string;
  ats_domain?: string;
  current_step?: string;
}

interface ContextSummary {
  profilePresent: boolean;
  answerCount: number;
  resumeCount: number;
  uploadedContextCount: number;
  uploadedContextChars: number;
}

let activeTabId: number | undefined;
let activeSession: ApplicationSession | undefined;
let pageSnapshotId: string | undefined;
let suggestions: Suggestion[] = [];
let detectedFields: FieldMetadata[] = [];
let scannedPageText = "";
let savedResumeVersionId: string | undefined;
let contextSummary: ContextSummary | undefined;

const scanButton = document.querySelector<HTMLButtonElement>("#scanButton");
const fillButton = document.querySelector<HTMLButtonElement>("#fillButton");
const fillAllButton = document.querySelector<HTMLButtonElement>("#fillAllButton");
const collapseButton = document.querySelector<HTMLButtonElement>("#collapseButton");
const expandButton = document.querySelector<HTMLButtonElement>("#expandButton");
const toggleResumeButton = document.querySelector<HTMLButtonElement>("#toggleResumeButton");
const saveResumeButton = document.querySelector<HTMLButtonElement>("#saveResumeButton");
const tailorResumeButton = document.querySelector<HTMLButtonElement>("#tailorResumeButton");
const selectHighConfidenceButton = document.querySelector<HTMLButtonElement>(
  "#selectHighConfidenceButton",
);
const clearSelectionButton = document.querySelector<HTMLButtonElement>("#clearSelectionButton");
const resumeWorkspace = document.querySelector<HTMLElement>("#resumeWorkspace");
const resumeFileInput = document.querySelector<HTMLInputElement>("#resumeFileInput");
const resumeText = document.querySelector<HTMLTextAreaElement>("#resumeText");
const resumeStatus = document.querySelector<HTMLElement>("#resumeStatus");
const collapsedView = document.querySelector<HTMLElement>("#collapsedView");
const expandedView = document.querySelector<HTMLElement>("#expandedView");
const statusElement = document.querySelector<HTMLElement>("#status");
const statusTextElement = document.querySelector<HTMLElement>("#statusText");
const statusSpinner = document.querySelector<HTMLElement>("#statusSpinner");
const sessionElement = document.querySelector<HTMLElement>("#session");
const sessionText = document.querySelector<HTMLElement>("#sessionText");
const suggestionsForm = document.querySelector<HTMLFormElement>("#suggestionsForm");
const suggestionsElement = document.querySelector<HTMLElement>("#suggestions");

function setStatus(text: string) {
  if (statusTextElement) statusTextElement.textContent = text;
  else if (statusElement) statusElement.textContent = text;
}

function setBusy(busy: boolean, text?: string) {
  document.body.classList.toggle("is-busy", busy);
  if (text) setStatus(text);

  [
    scanButton,
    fillButton,
    fillAllButton,
    saveResumeButton,
    tailorResumeButton,
    selectHighConfidenceButton,
    clearSelectionButton,
  ].forEach((button) => {
    if (!button) return;
    button.disabled = busy;
  });
}

function setAnswerLoading(loading: boolean, text?: string) {
  if (statusSpinner) statusSpinner.hidden = !loading;
  if (text) setStatus(text);
}

function setResumeStatus(text: string) {
  if (resumeStatus) resumeStatus.textContent = text;
}

async function setCollapsed(collapsed: boolean) {
  document.body.classList.toggle("collapsed", collapsed);
  if (collapsedView) collapsedView.hidden = !collapsed;
  if (expandedView) expandedView.hidden = collapsed;
}

async function restoreCollapsedState() {
  await chrome.storage.local.remove("sidePanelCollapsed");
  await setCollapsed(false);
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

function lockedTabId() {
  if (!activeTabId) {
    throw new Error("Scan a page first so the extension can lock onto that tab.");
  }
  return activeTabId;
}

function renderSession(session: ApplicationSession) {
  if (!sessionElement || !sessionText) return;
  sessionElement.hidden = false;
  const sessionLabel = [session.company, session.role, session.ats_domain]
    .filter(Boolean)
    .join(" · ") || session.current_step || session.id;
  const contextLabel = contextSummary
    ? `Context: ${contextSummary.uploadedContextCount} uploaded docs, ${contextSummary.resumeCount} resumes, ${contextSummary.answerCount} saved answers`
    : "Context: not loaded yet";
  sessionText.textContent = `${sessionLabel}\n${contextLabel}`;
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
    const sourceParts = [
      suggestion.sourceType,
      `${confidence}% confidence`,
      suggestion.provider ? `provider: ${suggestion.provider}` : "",
      suggestion.model ? `model: ${suggestion.model}` : "",
      suggestion.isGenerated ? "generated draft" : "",
      suggestion.sourceContext?.contextUsed ? `context: ${suggestion.sourceContext.contextUsed}` : "",
    ].filter(Boolean);
    source.textContent = sourceParts.join(" · ");

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

function selectedSuggestionsFromDom(fillAll = false) {
  if (fillAll) return suggestions;
  const selected = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="field"]:checked'),
  ).map((input) => input.value);
  return suggestions.filter((suggestion) => selected.includes(suggestion.fieldId));
}

async function saveResume() {
  if (!resumeText?.value.trim()) {
    setResumeStatus("Paste or upload resume text first.");
    return;
  }

  saveResumeButton?.setAttribute("disabled", "true");
  saveResumeButton?.setAttribute("disabled", "true");
  setStatus("Saving resume...");
  setResumeStatus("Saving resume...");
  try {
    const saved = await api<{ id: string; label: string }>("/resume-versions", {
      method: "POST",
      body: JSON.stringify({
        label: "Side panel resume",
        parsedText: resumeText.value,
        metadata: { source: "extension_side_panel" },
      }),
    });
    savedResumeVersionId = saved.id;
    setResumeStatus(`Saved resume: ${saved.label}`);
  } catch (error) {
    setResumeStatus(error instanceof Error ? error.message : "Could not save resume.");
  } finally {
    saveResumeButton?.removeAttribute("disabled");
  }
}

async function tailorResumeFromScan() {
  if (!resumeText?.value.trim() && !savedResumeVersionId) {
    setResumeStatus("Paste, upload, or save a resume first.");
    return;
  }
  if (!scannedPageText) {
    setResumeStatus("Scan the job page first so the JD can be used.");
    return;
  }

  tailorResumeButton?.setAttribute("disabled", "true");
  tailorResumeButton?.setAttribute("disabled", "true");
  setStatus("Tailoring resume from scanned job description...");
  setResumeStatus("Tailoring resume from scanned job description...");
  try {
    const response = await api<{
      tailoredResume: string;
      provider: string;
      savedResume?: { id: string; label: string } | null;
    }>("/resume-versions/tailor", {
      method: "POST",
      body: JSON.stringify({
        resumeVersionId: savedResumeVersionId,
        resumeText: resumeText?.value || undefined,
        jobDescription: scannedPageText,
        label: "Tailored resume draft",
        save: true,
      }),
    });
    if (resumeText) resumeText.value = response.tailoredResume;
    if (response.savedResume?.id) savedResumeVersionId = response.savedResume.id;
    setResumeStatus(`Tailored resume with ${response.provider}. Review before using.`);
  } catch (error) {
    setResumeStatus(error instanceof Error ? error.message : "Could not tailor resume.");
  } finally {
    tailorResumeButton?.removeAttribute("disabled");
  }
}

async function loadResumeFile() {
  const file = resumeFileInput?.files?.[0];
  if (!file || !resumeText) return;
  if (!/\.(txt|md|text)$/i.test(file.name)) {
    setResumeStatus("This MVP supports text and Markdown resume files.");
    return;
  }
  resumeText.value = await file.text();
  setResumeStatus(`Loaded ${file.name}. Save it before tailoring if you want it stored.`);
}

async function loadLatestResume() {
  try {
    const resumes = await api<Array<{ id: string; label: string; parsed_text?: string }>>(
      "/resume-versions",
    );
    const latest = resumes[0];
    if (!latest) return;
    savedResumeVersionId = latest.id;
    if (resumeText && latest.parsed_text) resumeText.value = latest.parsed_text;
    setResumeStatus(`Loaded latest saved resume: ${latest.label}`);
  } catch {
    setResumeStatus("Resume workspace ready.");
  }
}

async function scanPage() {
  if (!scanButton) return;
  scanButton.disabled = true;
  setStatus("Scanning visible fields...");

  try {
    const tab = await activeTab();
    setStatus("Requesting access to this page...");
    await ensurePagePermission(tab);
    setStatus("Injecting page scanner...");
    await ensureContentScripts(tab.id!);
    setStatus("Reading visible fields and job description...");
    const scan = await chrome.tabs.sendMessage<unknown, ScanResult>(tab.id!, {
      type: "SCAN_VISIBLE_FIELDS",
    });
    detectedFields = scan.fields;
    scannedPageText = scan.visibleText ?? "";

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
          visibleText: scannedPageText,
        }),
      },
    );
    pageSnapshotId = snapshot.id;

    setAnswerLoading(true, "Getting AI answers...");
    const response = await api<{ suggestions: Suggestion[]; contextSummary?: ContextSummary }>(
      `/application-sessions/${activeSession.id}/suggestions`,
      {
        method: "POST",
        body: JSON.stringify({
          pageSnapshotId,
          fields: scan.fields,
          visibleText: scannedPageText,
        }),
      },
    );
    setAnswerLoading(false);
    suggestions = response.suggestions;
    contextSummary = response.contextSummary;
    renderSession(activeSession);
    renderSuggestions();
    setStatus(
      suggestions.length
        ? "Review suggestions and select fields to fill."
        : `Found ${scan.fields.length} fields, but no suggestions yet.`,
    );
  } catch (error) {
    setAnswerLoading(false);
    setStatus(error instanceof Error ? error.message : "Scan failed.");
  } finally {
    scanButton.disabled = false;
  }
}

async function fillSuggestions(fillAll = false) {
  if (!activeSession || !pageSnapshotId) return;

  const selectedSuggestions = selectedSuggestionsFromDom(fillAll);
  if (!selectedSuggestions.length) {
    setStatus("Select at least one suggestion to fill.");
    return;
  }

  fillButton?.setAttribute("disabled", "true");
  fillAllButton?.setAttribute("disabled", "true");
  setStatus(fillAll ? "Filling all reviewed suggestions..." : "Filling selected fields...");

  try {
    await chrome.tabs.sendMessage(lockedTabId(), {
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
    fillAllButton?.removeAttribute("disabled");
  }
}

async function fillSelected(event: SubmitEvent) {
  event.preventDefault();
  await fillSuggestions(false);
}

scanButton?.addEventListener("click", scanPage);
suggestionsForm?.addEventListener("submit", fillSelected);
fillAllButton?.addEventListener("click", () => fillSuggestions(true));
collapseButton?.addEventListener("click", () => setCollapsed(true));
expandButton?.addEventListener("click", () => setCollapsed(false));
selectHighConfidenceButton?.addEventListener("click", selectHighConfidence);
clearSelectionButton?.addEventListener("click", () => setAllSelections(false));
toggleResumeButton?.addEventListener("click", () => {
  if (!resumeWorkspace || !toggleResumeButton) return;
  resumeWorkspace.hidden = !resumeWorkspace.hidden;
  toggleResumeButton.textContent = resumeWorkspace.hidden ? "Open" : "Close";
});
resumeFileInput?.addEventListener("change", loadResumeFile);
saveResumeButton?.addEventListener("click", saveResume);
tailorResumeButton?.addEventListener("click", tailorResumeFromScan);
restoreCollapsedState();
loadLatestResume();
