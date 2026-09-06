const panelPath = (tabId: number) => `ui/sidepanel.html?tabId=${tabId}`;

async function configureTabPanel(tabId: number, tabUrl?: string) {
  const enabled = Boolean(tabUrl && /^https?:\/\//.test(tabUrl));
  await chrome.sidePanel.setOptions({
    tabId,
    path: enabled ? panelPath(tabId) : undefined,
    enabled,
  });
}

async function initializeSidePanels() {
  await chrome.sidePanel.setOptions({ enabled: false });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === "number")
      .map((tab) => configureTabPanel(tab.id, tab.url)),
  );
}

initializeSidePanels().catch(() => {
  // Older Chromium builds can ignore this API during local development.
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "loading") return;
  configureTabPanel(tabId, tab.url).catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`reviewState:${tabId}`).catch(() => undefined);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ backendBaseUrl: "http://jobapply.localhost:8080" });
  initializeSidePanels().catch(() => undefined);
});
