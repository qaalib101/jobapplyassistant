import { chromium, test as base, expect, type BrowserContext, type Page } from "@playwright/test";

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  sidePanel: Page;
}>({
  context: async ({}, use) => {
    const extensionPath = process.env.E2E_EXTENSION_PATH;
    if (!extensionPath) throw new Error("E2E_EXTENSION_PATH is required.");

    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker");
    const extensionId = serviceWorker.url().split("/")[2];
    await serviceWorker.evaluate(async (backendBaseUrl) => {
      await chrome.storage.local.set({ backendBaseUrl });
    }, process.env.E2E_BASE_URL ?? "http://localhost:4327");
    await use(extensionId);
  },

  sidePanel: async ({ context, extensionId }, use) => {
    const sidePanel = await context.newPage();
    await sidePanel.goto(`chrome-extension://${extensionId}/ui/sidepanel.html`);
    await use(sidePanel);
    await sidePanel.close();
  },
});

export { expect };
