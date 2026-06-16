const titleInput = document.querySelector("#contextTitle");
const textInput = document.querySelector("#contextText");
const saveButton = document.querySelector("#saveButton");
const statusElement = document.querySelector("#status");
const resumeFile = document.querySelector("#resumeFile");
const resumeLabel = document.querySelector("#resumeLabel");
const resumeText = document.querySelector("#resumeText");
const saveResumeButton = document.querySelector("#saveResumeButton");
const resumeStatus = document.querySelector("#resumeStatus");
const refreshSourcesButton = document.querySelector("#refreshSourcesButton");
const sourcesStatus = document.querySelector("#sourcesStatus");
const profilePreview = document.querySelector("#profilePreview");
const contextPreview = document.querySelector("#contextPreview");
const resumePreview = document.querySelector("#resumePreview");
const answerBankPreview = document.querySelector("#answerBankPreview");
const providerPreview = document.querySelector("#providerPreview");

function setStatus(message) {
  statusElement.textContent = message;
}

function setResumeStatus(message) {
  resumeStatus.textContent = message;
}

function setSourcesStatus(message) {
  sourcesStatus.textContent = message;
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined || value === "") return "Not set";
  return String(value);
}

function renderDefinitionList(element, rows) {
  element.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = formatValue(value);
    element.append(term, description);
  }
}

function renderList(element, items, emptyText) {
  element.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "source-meta";
    empty.textContent = emptyText;
    element.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "source-item";

    const title = document.createElement("div");
    title.className = "source-title";
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "source-meta";
    meta.textContent = item.meta;

    row.append(title, meta);
    element.append(row);
  }
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return response.json();
}

async function loadDataSources() {
  refreshSourcesButton.disabled = true;
  setSourcesStatus("Loading data sources...");
  try {
    const [profile, context, resumes, answers, providers] = await Promise.all([
      fetchJson("/api/profile"),
      fetchJson("/api/context"),
      fetchJson("/api/resume-versions"),
      fetchJson("/api/answer-bank"),
      fetchJson("/api/ai/providers"),
    ]);

    renderDefinitionList(profilePreview, [
      ["Name", profile.full_name],
      ["Email", profile.email],
      ["Phone", profile.phone],
      ["Location", profile.location],
      ["LinkedIn", profile.linkedin_url],
      ["GitHub", profile.github_url],
      ["Portfolio", profile.portfolio_url],
      ["Work auth", profile.work_authorization],
      ["Sponsorship", profile.sponsorship_required],
      ["Updated", profile.updated_at],
    ]);

    renderDefinitionList(contextPreview, [
      ["Title", context.title],
      ["Characters", context.content?.length?.toLocaleString()],
      ["Active", context.is_active ?? Boolean(context.content)],
      ["Updated", context.updated_at],
    ]);

    renderList(
      resumePreview,
      resumes.slice(0, 5).map((resume) => ({
        title: resume.label || "Resume",
        meta: `${(resume.parsed_text?.length ?? 0).toLocaleString()} chars · ${resume.file_name || "manual text"} · ${formatDate(resume.updated_at)}`,
      })),
      "No saved resumes.",
    );

    renderList(
      answerBankPreview,
      answers.slice(0, 5).map((answer) => ({
        title: answer.question_text,
        meta: `${answer.answer_text.length.toLocaleString()} chars · ${(answer.tags || []).join(", ") || "no tags"}`,
      })),
      "No saved answers.",
    );

    renderList(
      providerPreview,
      providers.availableProviders.map((provider) => ({
        title:
          provider.id === providers.activeProvider
            ? `${provider.label} active`
            : provider.label,
        meta: `${provider.mode} · ${provider.configured ? "configured" : "not configured"}${provider.id === providers.fallbackProvider ? " · fallback" : ""}`,
      })),
      "No providers configured.",
    );

    setSourcesStatus("Data sources loaded.");
  } catch (error) {
    setSourcesStatus(error instanceof Error ? error.message : "Could not load data sources.");
  } finally {
    refreshSourcesButton.disabled = false;
  }
}

async function loadContext() {
  try {
    const response = await fetch("/api/context");
    if (!response.ok) throw new Error(`Load failed with ${response.status}`);
    const context = await response.json();
    titleInput.value = context.title || "General AI context";
    textInput.value = context.content || "";
    setStatus("Saved context loaded.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not load context.");
  }
}

async function saveContext() {
  saveButton.disabled = true;
  setStatus("Saving...");
  try {
    const response = await fetch("/api/context", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value || "General AI context",
        content: textInput.value,
        tags: ["general"],
      }),
    });
    if (!response.ok) throw new Error(`Save failed with ${response.status}`);
    const saved = await response.json();
    setStatus(`Saved ${saved.content.length.toLocaleString()} characters.`);
    await loadDataSources();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not save context.");
  } finally {
    saveButton.disabled = false;
  }
}

saveButton.addEventListener("click", saveContext);
resumeFile.addEventListener("change", async () => {
  const file = resumeFile.files?.[0];
  if (!file) return;
  if (!/\.(txt|md|text)$/i.test(file.name)) {
    setResumeStatus("This MVP supports text and Markdown resume files.");
    return;
  }
  resumeLabel.value = file.name.replace(/\.(txt|md|text)$/i, "");
  resumeText.value = await file.text();
  setResumeStatus(`Loaded ${file.name}. Save it to use in the extension.`);
});

saveResumeButton.addEventListener("click", async () => {
  if (!resumeText.value.trim()) {
    setResumeStatus("Paste or upload resume text first.");
    return;
  }

  saveResumeButton.disabled = true;
  setResumeStatus("Saving resume...");
  try {
    const response = await fetch("/api/resume-versions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: resumeLabel.value || "Base resume",
        parsedText: resumeText.value,
        fileName: resumeFile.files?.[0]?.name,
        metadata: { source: "companion_ui" },
      }),
    });
    if (!response.ok) throw new Error(`Save failed with ${response.status}`);
    const saved = await response.json();
    setResumeStatus(`Saved resume: ${saved.label}`);
    await loadDataSources();
  } catch (error) {
    setResumeStatus(error instanceof Error ? error.message : "Could not save resume.");
  } finally {
    saveResumeButton.disabled = false;
  }
});

refreshSourcesButton.addEventListener("click", loadDataSources);
loadContext();
loadDataSources();
