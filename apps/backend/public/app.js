const titleInput = document.querySelector("#contextTitle");
const textInput = document.querySelector("#contextText");
const saveButton = document.querySelector("#saveButton");
const statusElement = document.querySelector("#status");

function setStatus(message) {
  statusElement.textContent = message;
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
loadContext();
