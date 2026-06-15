chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  // Older Chromium builds can ignore this API during local development.
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ backendBaseUrl: "http://localhost:4317" });
});
