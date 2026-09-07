type FieldSensitivity = "normal" | "sensitive" | "manual-only";

type ReviewStatus = "pending" | "accepted" | "edited" | "rejected" | "skipped" | "blocked";

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
  currentValue?: string;
  checked?: boolean;
  sensitivity?: FieldSensitivity;
  category?: FieldCategory;
}

interface Suggestion {
  id?: string;
  fieldId: string;
  fieldLabel?: string;
  fieldType: string;
  suggestedValue: string;
  confidence: number;
  sourceType: string;
  sourceContext: Record<string, unknown>;
  provider?: string;
  model?: string;
  contextRevisionId?: string | null;
  isGenerated: boolean;
  requiresUserReview: true;
}

interface SuggestionDecision {
  fieldId: string;
  fieldSuggestionId?: string;
  reviewStatus: ReviewStatus;
  editedValue?: string;
  originalValue?: string;
  provider?: string;
  model?: string;
  confidence?: number;
  sourceType?: string;
}

interface BlockedFieldInfo {
  fieldId: string;
  fieldLabel?: string;
  reason: string;
}

interface FillResult {
  fieldId: string;
  filled: boolean;
  skipped?: string;
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
  contextRevisionId: string | null;
}

interface ContextDocument {
  id?: string;
  content?: string;
  is_active?: boolean;
}

interface StoredReviewState {
  version: 1;
  tabId: number;
  pageUrl: string;
  pageTitle: string;
  pageSignature: string;
  activeSession: ApplicationSession;
  pageSnapshotId: string;
  suggestions: Suggestion[];
  detectedFields: FieldMetadata[];
  scannedPageText: string;
  contextSummary?: ContextSummary;
  selectedFieldIds: string[];
  reviewedValues: Record<string, string>;
  status: string;
}

let activeTabId: number | undefined;
let activeSession: ApplicationSession | undefined;
let pageSnapshotId: string | undefined;
let suggestions: Suggestion[] = [];
let detectedFields: FieldMetadata[] = [];
let scannedPageText = "";
let savedResumeVersionId: string | undefined;
let contextSummary: ContextSummary | undefined;
let scannedPageUrl = "";
let scannedPageTitle = "";
let scannedPageSignature = "";
let persistTimer: number | undefined;

const scanButton = document.querySelector<HTMLButtonElement>("#scanButton");
const fillButton = document.querySelector<HTMLButtonElement>("#fillButton");
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

async function api<T>(path: string, init?: RequestInit, timeoutMs = 30000): Promise<T> {
  const baseUrl = await backendBaseUrl();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api${path}`, {
      ...init,
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("API request timed out. Check the backend logs or switch AI_PROVIDER=mock.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) throw new Error("No active tab found.");
  return tab;
}

function requestedTabId() {
  const value = new URLSearchParams(location.search).get("tabId");
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function reviewStateKey(tabId: number) {
  return `reviewState:${tabId}`;
}

function signatureFor(fields: FieldMetadata[]) {
  return fields
    .map((field) => `${field.fieldId}:${field.type}`)
    .sort()
    .join("|");
}

function selectedFieldIds() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="field"]:checked'),
  ).map((input) => input.value);
}

function reviewedValues() {
  return Object.fromEntries(
    Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".value[data-field-id]"))
      .map((input) => [input.dataset.fieldId ?? "", input.value])
      .filter(([fieldId]) => Boolean(fieldId)),
  );
}

async function persistReviewState() {
  if (!activeTabId || !activeSession || !pageSnapshotId || !scannedPageUrl) return;
  const state: StoredReviewState = {
    version: 1,
    tabId: activeTabId,
    pageUrl: scannedPageUrl,
    pageTitle: scannedPageTitle,
    pageSignature: scannedPageSignature,
    activeSession,
    pageSnapshotId,
    suggestions,
    detectedFields,
    scannedPageText,
    contextSummary,
    selectedFieldIds: selectedFieldIds(),
    reviewedValues: reviewedValues(),
    status: statusTextElement?.textContent ?? "Review suggestions and select fields to fill.",
  };
  await chrome.storage.session.set({ [reviewStateKey(activeTabId)]: state });
}

function queuePersistReviewState() {
  if (persistTimer !== undefined) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistReviewState().catch(() => undefined);
  }, 150);
}

async function restoreReviewState(tabId: number) {
  const stored = await chrome.storage.session.get(reviewStateKey(tabId));
  const state = stored[reviewStateKey(tabId)] as StoredReviewState | undefined;
  if (!state || state.version !== 1 || state.tabId !== tabId) return false;

  const tab = await chrome.tabs.get(tabId);
  if (tab.url !== state.pageUrl) {
    await chrome.storage.session.remove(reviewStateKey(tabId));
    setStatus("This tab has navigated to a different page. Scan it to start a new review.");
    return false;
  }

  activeSession = state.activeSession;
  pageSnapshotId = state.pageSnapshotId;
  suggestions = state.suggestions;
  detectedFields = state.detectedFields;
  scannedPageText = state.scannedPageText;
  contextSummary = state.contextSummary;
  scannedPageUrl = state.pageUrl;
  scannedPageTitle = state.pageTitle;
  scannedPageSignature = state.pageSignature;
  renderSession(activeSession);
  renderSuggestions(state);
  setStatus(state.status);
  return true;
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
    files: ["content/fieldPolicy.js", "content/controlSupport.js", "content/scanner.js", "content/filler.js"],
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

async function loadContextStatus() {
  const [context, answers, resumes] = await Promise.all([
    api<ContextDocument>("/context", undefined, 10000),
    api<unknown[]>("/answer-bank", undefined, 10000),
    api<unknown[]>("/resume-versions", undefined, 10000),
  ]);
  const uploadedContextChars = context.content?.length ?? 0;
  contextSummary = {
    profilePresent: true,
    answerCount: answers.length,
    resumeCount: resumes.length,
    uploadedContextCount: uploadedContextChars > 0 || context.is_active ? 1 : 0,
    uploadedContextChars,
    contextRevisionId: context.id ?? null,
  };
  if (activeSession) renderSession(activeSession);
}

function renderSuggestions(restored?: StoredReviewState) {
  if (!suggestionsForm || !suggestionsElement) return;
  suggestionsForm.hidden = suggestions.length === 0;
  suggestionsElement.replaceChildren();

  for (const suggestion of suggestions) {
    const sensitivity = detectedFields.find((field) => field.fieldId === suggestion.fieldId)?.sensitivity ?? "normal";
    const row = document.createElement("label");
    row.className = "suggestion";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "field";
    checkbox.value = suggestion.fieldId;
    checkbox.checked = restored
      ? restored.selectedFieldIds.includes(suggestion.fieldId)
      : sensitivity === "normal" && suggestion.confidence >= 0.9 && !suggestion.isGenerated;
    checkbox.addEventListener("change", () => {
      updateFillButtonLabel();
      queuePersistReviewState();
    });

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
    value.value = restored?.reviewedValues[suggestion.fieldId] ?? suggestion.suggestedValue;
    value.addEventListener("input", queuePersistReviewState);
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
      sensitivity === "sensitive" ? "protected answer" : "",
      suggestion.sourceContext?.contextUsed ? `context: ${suggestion.sourceContext.contextUsed}` : "",
    ].filter(Boolean);
    source.textContent = sourceParts.join(" · ");

    body.append(title, value, source);
    if (suggestion.isGenerated) {
      const warning = document.createElement("div");
      warning.className = "generated-warning";
      warning.textContent = "Generated draft. Edit and review before filling.";
      body.append(warning);
    } else if (sensitivity === "sensitive") {
      const warning = document.createElement("div");
      warning.className = "generated-warning";
      warning.textContent = "Protected profile answer. Confirm this field explicitly before filling.";
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
    const sourceParts = ["Detected field"];
    if (field.sensitivity && field.sensitivity !== "normal") {
      sourceParts.push(`manual entry: ${field.sensitivity}`);
    }
    if (field.category && field.category !== "unknown") {
      sourceParts.push(`category: ${field.category}`);
    }
    if (field.currentValue) {
      sourceParts.push(`current: "${field.currentValue.slice(0, 30)}${field.currentValue.length > 30 ? "..." : ""}"`);
    }
    if (field.checked !== undefined) {
      sourceParts.push(`checked: ${field.checked}`);
    }
    source.textContent = sourceParts.join(" · ");

    body.append(title, source);
    row.append(spacer, body);
    suggestionsElement.append(row);
  }
  updateFillButtonLabel();
}

function updateFillButtonLabel() {
  if (!fillButton) return;
  const count = document.querySelectorAll<HTMLInputElement>('input[name="field"]:checked').length;
  fillButton.textContent = count > 0 ? `Confirm & fill ${count} selected` : "Select fields to fill";
  fillButton.disabled = count === 0;
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
  updateFillButtonLabel();
  queuePersistReviewState();
}

function selectHighConfidence() {
  document
    .querySelectorAll<HTMLInputElement>('input[name="field"]')
    .forEach((input) => {
      const suggestion = suggestions.find((item) => item.fieldId === input.value);
      const sensitivity = detectedFields.find((field) => field.fieldId === input.value)?.sensitivity ?? "normal";
      input.checked = Boolean(
        suggestion &&
        sensitivity === "normal" &&
        suggestion.confidence >= 0.85 &&
        !suggestion.isGenerated,
      );
    });
  updateFillButtonLabel();
  queuePersistReviewState();
}

function selectedSuggestionsFromDom() {
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
    if (activeTabId && tab.id !== activeTabId) {
      throw new Error("This panel belongs to another tab. Open the extension from the current tab.");
    }
    activeTabId = tab.id;
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
    scannedPageUrl = scan.pageUrl;
    scannedPageTitle = scan.pageTitle;
    scannedPageSignature = signatureFor(scan.fields);

    setStatus(`Found ${scan.fields.length} visible fields. Resolving session...`);

    activeSession = await api<ApplicationSession>("/application-sessions/resolve", {
      method: "POST",
      body: JSON.stringify({
        pageUrl: scan.pageUrl,
        pageTitle: scan.pageTitle,
      }),
    });
    renderSession(activeSession);
    await loadContextStatus();

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
    const response = await api<{
      suggestions: Suggestion[];
      blockedFields?: BlockedFieldInfo[];
      contextSummary?: ContextSummary;
    }>(
      `/application-sessions/${activeSession.id}/suggestions`,
      {
        method: "POST",
        body: JSON.stringify({
          pageSnapshotId,
          fields: scan.fields,
          visibleText: scannedPageText,
        }),
      },
      70000,
    );
    setAnswerLoading(false);
    suggestions = response.suggestions;
    contextSummary = response.contextSummary;
    const blockedCount = response.blockedFields?.length ?? 0;
    renderSession(activeSession);
    renderSuggestions();
    const blockedMsg = blockedCount > 0 ? ` ${blockedCount} protected field(s) require manual entry.` : "";
    setStatus(
      suggestions.length
        ? `Review suggestions and select fields to fill.${blockedMsg}`
        : `Found ${scan.fields.length} fields, but no suggestions yet.${blockedMsg}`,
    );
    await persistReviewState();
  } catch (error) {
    setAnswerLoading(false);
    setStatus(error instanceof Error ? error.message : "Scan failed.");
  } finally {
    scanButton.disabled = false;
  }
}

async function fillSuggestions() {
  if (!activeSession || !pageSnapshotId) return;

  const selectedSuggestions = selectedSuggestionsFromDom();
  if (!selectedSuggestions.length) {
    setStatus("Select at least one suggestion to fill.");
    return;
  }

  fillButton?.setAttribute("disabled", "true");
  setStatus("Filling your confirmed selections...");

  try {
    const tab = await activeTab();
    if (tab.id !== lockedTabId()) {
      throw new Error("Switch back to the tab that was scanned before filling.");
    }
    await ensureContentScripts(tab.id!);
    const currentScan = await chrome.tabs.sendMessage<unknown, ScanResult>(tab.id!, {
      type: "SCAN_VISIBLE_FIELDS",
    });
    if (
      currentScan.pageUrl !== scannedPageUrl ||
      signatureFor(currentScan.fields) !== scannedPageSignature
    ) {
      throw new Error("This application page changed. Rescan before filling these suggestions.");
    }

    const fillResponse = await chrome.tabs.sendMessage<unknown, { results?: FillResult[] }>(lockedTabId(), {
      type: "FILL_SELECTED_FIELDS",
      fields: selectedSuggestions.map((suggestion) => ({
        fieldId: suggestion.fieldId,
        value: reviewedValue(suggestion.fieldId),
      })),
    });

    const resultsByField = new Map(
      (fillResponse.results ?? []).map((result) => [result.fieldId, result]),
    );

    await api(`/application-sessions/${activeSession.id}/filled-fields`, {
      method: "POST",
      body: JSON.stringify({
        pageSnapshotId,
        fields: selectedSuggestions.map((suggestion) => {
          const result = resultsByField.get(suggestion.fieldId);
          const filled = result?.filled ?? false;
          return {
            fieldSuggestionId: suggestion.id,
            fieldId: suggestion.fieldId,
            fieldLabel: suggestion.fieldLabel,
            filled,
            filledValue: filled ? reviewedValue(suggestion.fieldId) : undefined,
            skipped: filled ? undefined : result?.skipped ?? "no-fill-result",
          };
        }),
      }),
    });

    // Build and send decision records for audit trail
    const decisions: SuggestionDecision[] = selectedSuggestions.map((suggestion) => {
      const currentValue = reviewedValue(suggestion.fieldId);
      const wasEdited = currentValue !== suggestion.suggestedValue;
      return {
        fieldId: suggestion.fieldId,
        fieldSuggestionId: suggestion.id,
        reviewStatus: wasEdited ? "edited" : "accepted",
        originalValue: suggestion.suggestedValue,
        editedValue: wasEdited ? currentValue : undefined,
        provider: suggestion.provider,
        model: suggestion.model,
        confidence: suggestion.confidence,
        sourceType: suggestion.sourceType,
      };
    });

    // Also log skipped suggestions (unchecked)
    const skippedSuggestions = suggestions.filter(
      (s) => !selectedSuggestions.some((sel) => sel.fieldId === s.fieldId),
    );
    for (const skipped of skippedSuggestions) {
      decisions.push({
        fieldId: skipped.fieldId,
        reviewStatus: "skipped",
        provider: skipped.provider,
        model: skipped.model,
        confidence: skipped.confidence,
        sourceType: skipped.sourceType,
      });
    }

    await api(`/application-sessions/${activeSession.id}/suggestion-decisions`, {
      method: "POST",
      body: JSON.stringify({
        pageSnapshotId,
        decisions,
      }),
    });

    const filledCount = selectedSuggestions.filter(
      (suggestion) => resultsByField.get(suggestion.fieldId)?.filled,
    ).length;
    const failedCount = selectedSuggestions.length - filledCount;
    const failedLabels = selectedSuggestions
      .filter((suggestion) => !resultsByField.get(suggestion.fieldId)?.filled)
      .map((suggestion) => suggestion.fieldLabel || suggestion.fieldId)
      .join(", ");
    setStatus(
      failedCount > 0
        ? `${filledCount} field(s) filled; ${failedCount} could not be filled: ${failedLabels}. Review the page and rescan if needed.`
        : `${filledCount} field(s) filled. Review the page before continuing.`,
    );
    await persistReviewState();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Fill failed.");
  } finally {
    fillButton?.removeAttribute("disabled");
    updateFillButtonLabel();
  }
}

async function fillSelected(event: SubmitEvent) {
  event.preventDefault();
  await fillSuggestions();
}

scanButton?.addEventListener("click", scanPage);
suggestionsForm?.addEventListener("submit", fillSelected);
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
async function initialize() {
  await restoreCollapsedState();
  activeTabId = requestedTabId();
  const restored = activeTabId ? await restoreReviewState(activeTabId) : false;
  if (!restored) {
    loadContextStatus().catch(() => {
      contextSummary = undefined;
    });
  }
  await loadLatestResume();
}

initialize().catch((error) => {
  setStatus(error instanceof Error ? error.message : "Could not initialize the extension.");
});
