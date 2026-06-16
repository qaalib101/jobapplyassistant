const titleInput = document.querySelector("#contextTitle");
const textInput = document.querySelector("#contextText");
const saveButton = document.querySelector("#saveButton");
const statusElement = document.querySelector("#status");
const resumeFile = document.querySelector("#resumeFile");
const resumeLabel = document.querySelector("#resumeLabel");
const resumeText = document.querySelector("#resumeText");
const saveResumeButton = document.querySelector("#saveResumeButton");
const resumeStatus = document.querySelector("#resumeStatus");

function setStatus(message) {
  statusElement.textContent = message;
}

function setResumeStatus(message) {
  resumeStatus.textContent = message;
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
  } catch (error) {
    setResumeStatus(error instanceof Error ? error.message : "Could not save resume.");
  } finally {
    saveResumeButton.disabled = false;
  }
});

loadContext();
