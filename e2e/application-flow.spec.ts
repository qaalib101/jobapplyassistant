import { PrismaClient } from "@prisma/client";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const prisma = new PrismaClient();

async function scan(page: Page, sidePanel: Page) {
  await page.bringToFront();
  await sidePanel.locator("#scanButton").evaluate((button: HTMLButtonElement) => button.click());
  await expect
    .poll(() => sidePanel.locator("#statusText").textContent(), { timeout: 30_000 })
    .toMatch(/Review suggestions|no suggestions/);
}

async function confirmSelected(sidePanel: Page) {
  await sidePanel.locator("#suggestionsForm").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect
    .poll(() => sidePanel.locator("#statusText").textContent(), { timeout: 20_000 })
    .toMatch(/field\(s\) filled/);
}

function suggestion(sidePanel: Page, label: string) {
  return sidePanel.locator(".suggestion").filter({ hasText: label }).first();
}

test.beforeAll(async ({ request }) => {
  const providerResponse = await request.get("/api/ai/providers");
  expect(providerResponse.ok()).toBeTruthy();
  const providers = await providerResponse.json();
  expect(providers.activeProvider).toBe("mock");
  expect(providers.availableProviders).toContainEqual(
    expect.objectContaining({ id: "mock", configured: true, mode: "local" }),
  );

  const profileResponse = await request.put("/api/profile", {
    data: {
      fullName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      preferredName: "Ada",
      email: "ada@lovelace.test",
      phone: "312-555-0101",
      location: "Chicago, IL",
      streetAddress: "123 Analytical Engine Way",
      city: "Chicago",
      stateRegion: "IL",
      postalCode: "60601",
      country: "United States",
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUrl: "https://github.com/ada",
      portfolioUrl: "https://ada.dev",
      workAuthorization: "Yes",
      sponsorshipRequired: false,
      dateOfBirth: "1990-12-10",
      gender: "Non-binary",
      genderIdentity: "Non-binary",
      pronouns: "they/them",
      raceEthnicity: "Prefer not to say",
      disabilityStatus: "No, I do not have a disability",
      veteranStatus: "I am not a protected veteran",
    },
  });
  expect(profileResponse.ok()).toBeTruthy();

  const setMiddleName = await request.put("/api/profile", { data: { middleName: "Byron" } });
  expect(setMiddleName.ok()).toBeTruthy();
  const clearMiddleName = await request.put("/api/profile", { data: { middleName: null } });
  expect(clearMiddleName.ok()).toBeTruthy();
  const storedProfile = await request.get("/api/profile");
  await expect(storedProfile.json()).resolves.toEqual(expect.objectContaining({
    first_name: "Ada",
    middle_name: null,
    last_name: "Lovelace",
    preferred_name: "Ada",
    city: "Chicago",
    state_region: "IL",
    postal_code: "60601",
    country: "United States",
    gender_identity: "Non-binary",
    pronouns: "they/them",
  }));
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Companion UI saves reusable career context", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByText("Data sources loaded.")).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill("E2E career context");
  await page.getByLabel("AI context", { exact: true }).fill(
    `Full Name: Ada Lovelace
Email: ada@lovelace.test
Location: Chicago, IL
Primary strengths: analytical engines, TypeScript platforms, and dependable documentation.`,
  );
  await page.getByRole("button", { name: "Save and parse context" }).click();
  await expect(page.getByText(/Saved \d+ characters and parsed 7 profile fields\./)).toBeVisible();

  const parsedFields = page.getByRole("region", { name: "Parsed profile fields" });
  await expect(parsedFields).toContainText("7 unchanged");
  await expect(parsedFields).toContainText("Full name");
  await expect(parsedFields).toContainText("Ada Lovelace");
  await expect(parsedFields).toContainText("From: Full Name");

  await page.getByLabel("AI context", { exact: true }).pressSequentially("\nPronouns: they/them");
  await expect(parsedFields.getByText("Unsaved edits")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save and parse context" })).toBeEnabled();

  const response = await request.get("/api/context");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({
      title: "E2E career context",
      content: expect.stringContaining("TypeScript platforms"),
    }),
  );
});

test("Greenhouse: scans, uses mock AI, confirms, fills, and audits", async ({ page, sidePanel }) => {
  await page.goto("http://greenhouse.localhost:4327/demos/greenhouse.html");
  await scan(page, sidePanel);

  const generated = suggestion(sidePanel, "Why are you interested");
  await expect(generated).toContainText("provider: mock");
  await expect(generated.locator('input[type="checkbox"]')).not.toBeChecked();
  await generated.locator("textarea").fill("I am interested in building reliable product platforms.");
  await generated.locator('input[type="checkbox"]').check();
  await confirmSelected(sidePanel);

  await expect(page.locator('[name="first_name"]')).toHaveValue("Ada");
  await expect(page.locator('[name="last_name"]')).toHaveValue("Lovelace");
  await expect(page.locator('[name="email"]')).toHaveValue("ada@lovelace.test");
  await expect(page.locator('[name="interest"]')).toHaveValue(
    "I am interested in building reliable product platforms.",
  );

  const session = await prisma.applicationSession.findFirstOrThrow({
    where: { ats_domain: "greenhouse.localhost" },
  });
  expect(await prisma.fieldSuggestion.count({ where: { application_session_id: session.id } })).toBeGreaterThan(5);
  expect(await prisma.fieldSuggestion.count({ where: { application_session_id: session.id, provider: "mock" } })).toBe(1);
  expect(await prisma.fieldSuggestion.count({
    where: { application_session_id: session.id, context_revision_id: { not: null } },
  })).toBeGreaterThan(5);
  expect(await prisma.aIRequestLog.count({ where: { application_session_id: session.id, provider: "mock", success: true } })).toBe(1);
  expect(await prisma.filledFieldLog.count({ where: { application_session_id: session.id, fill_succeeded: true } })).toBeGreaterThan(5);
  expect(await prisma.filledFieldLog.count({ where: { application_session_id: session.id, field_suggestion_id: null } })).toBe(0);
  expect(await prisma.suggestionDecisionLog.count({ where: { application_session_id: session.id, field_suggestion_id: { not: null } } })).toBeGreaterThan(5);
});

test("A pending review is restored only for its scanned tab and stale pages cannot fill", async ({
  context,
  extensionId,
  page,
  sidePanel,
}) => {
  await page.goto("http://greenhouse.localhost:4327/demos/greenhouse.html");
  await scan(page, sidePanel);

  const draft = suggestion(sidePanel, "Why are you interested");
  await draft.locator("textarea").fill("My tab-specific edited answer.");
  await draft.locator('input[type="checkbox"]').check();

  const applicationTabId = await sidePanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://greenhouse.localhost:4327/*" });
    return tabs[0]?.id;
  });
  expect(applicationTabId).toBeTruthy();

  await expect.poll(async () => sidePanel.evaluate(async (tabId) => {
    const stored = await chrome.storage.session.get(`reviewState:${tabId}`);
    return Object.values(stored[`reviewState:${tabId}`]?.reviewedValues ?? {});
  }, applicationTabId)).toContain("My tab-specific edited answer.");

  const restoredPanel = await context.newPage();
  await restoredPanel.goto(
    `chrome-extension://${extensionId}/ui/sidepanel.html?tabId=${applicationTabId}`,
  );
  const restoredDraft = suggestion(restoredPanel, "Why are you interested");
  await expect(restoredDraft.locator("textarea")).toHaveValue("My tab-specific edited answer.");
  await expect(restoredDraft.locator('input[type="checkbox"]')).toBeChecked();

  const otherTab = await context.newPage();
  await otherTab.goto("http://lever.localhost:4327/demos/lever.html");
  const otherTabId = await restoredPanel.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: "http://lever.localhost:4327/*" });
    return tabs[0]?.id;
  });
  const otherPanel = await context.newPage();
  await otherPanel.goto(`chrome-extension://${extensionId}/ui/sidepanel.html?tabId=${otherTabId}`);
  await expect(otherPanel.locator(".suggestion")).toHaveCount(0);

  await page.bringToFront();
  await page.locator('[name="first_name"]').evaluate((element) => element.remove());
  await restoredPanel.locator("#suggestionsForm").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(restoredPanel.locator("#statusText")).toHaveText(
    "This application page changed. Rescan before filling these suggestions.",
  );
  await expect(page.locator('[name="interest"]')).toHaveValue("");

  await otherPanel.close();
  await otherTab.close();
  await restoredPanel.close();
});

test("Lever: handles radio options and a mock-generated project answer", async ({ page, sidePanel }) => {
  await page.goto("http://lever.localhost:4327/demos/lever.html");
  await scan(page, sidePanel);

  const generated = suggestion(sidePanel, "Tell us about a project");
  await expect(generated).toContainText("provider: mock");
  await generated.locator("textarea").fill("I built a typed workflow system with measurable reliability gains.");
  await generated.locator('input[type="checkbox"]').check();
  await confirmSelected(sidePanel);

  await expect(page.locator('[name="name"]')).toHaveValue("Ada Lovelace");
  await expect(page.locator('[name="requires_sponsorship"][value="no"]')).toBeChecked();
  await expect(page.locator('[name="project_summary"]')).toHaveValue(
    "I built a typed workflow system with measurable reliability gains.",
  );
});

test("Workday: the user navigates each step and the extension only rescans", async ({ page, sidePanel }) => {
  await page.goto("http://workday.localhost:4327/demos/workday-personal.html");
  await scan(page, sidePanel);
  await confirmSelected(sidePanel);
  await expect(page).toHaveURL(/workday-personal\.html$/);
  await expect(page.locator('[name="legalName"]')).toHaveValue("Ada Lovelace");
  await expect(page.locator('[name="firstName"]')).toHaveValue("Ada");
  await expect(page.locator('[name="preferredName"]')).toHaveValue("Ada");
  await expect(page.locator('[name="addressLine1"]')).toHaveValue("123 Analytical Engine Way");
  await expect(page.locator('[name="city"]')).toHaveValue("Chicago");
  await expect(page.locator('[name="state"]')).toHaveValue("IL");
  await expect(page.locator('[name="postalCode"]')).toHaveValue("60601");
  await expect(page.locator('[name="country"]')).toHaveValue("US");

  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/workday-step\.html$/);
  await scan(page, sidePanel);
  const generated = suggestion(sidePanel, "Describe your relevant experience");
  await expect(generated).toContainText("provider: mock");
  await generated.locator("textarea").fill("I build dependable TypeScript applications and workflow automation.");
  await generated.locator('input[type="checkbox"]').check();
  await confirmSelected(sidePanel);
  await expect(page).toHaveURL(/workday-step\.html$/);

  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/workday-review\.html$/);

  const sessions = await prisma.applicationSession.findMany({
    where: { ats_domain: "workday.localhost" },
    include: { page_snapshots: true, filled_field_logs: true },
  });
  expect(sessions).toHaveLength(1);
  expect(sessions[0].page_snapshots).toHaveLength(2);
  expect(sessions[0].filled_field_logs.length).toBeGreaterThan(2);
  expect(sessions[0].filled_field_logs.every((log) => log.fill_succeeded)).toBe(true);
});

test("Pinpoint-style: isolates nested labels and fills confirmed custom comboboxes", async ({ page, sidePanel }) => {
  await page.goto("http://pinpoint.localhost:4327/demos/pinpoint-custom.html");
  await scan(page, sidePanel);

  const session = await prisma.applicationSession.findFirstOrThrow({
    where: { ats_domain: "pinpoint.localhost" },
    include: { page_snapshots: { orderBy: { created_at: "desc" }, take: 1 } },
  });
  const snapshot = session.page_snapshots[0].field_snapshot as { fields: Array<{ label?: string }> };
  const fields = snapshot.fields;
  expect(fields.map((field) => field.label)).toEqual([
    "First Name",
    "LinkedIn URL",
    "Country",
    "Current Location",
    "State / Province",
    "Gender Identity",
  ]);

  const protectedIdentity = suggestion(sidePanel, "Gender Identity");
  await expect(protectedIdentity).toContainText("protected answer");
  await expect(protectedIdentity.locator('input[type="checkbox"]')).not.toBeChecked();
  await protectedIdentity.locator('input[type="checkbox"]').check();
  await confirmSelected(sidePanel);

  await expect(page).toHaveURL(/pinpoint-custom\.html$/);
  await expect(page.locator('[name="firstName"]')).toHaveValue("Ada");
  await expect(page.locator('[name="linkedinUrl"]')).toHaveValue("https://linkedin.com/in/ada");
  await expect(page.locator("#location")).toHaveValue("Chicago, IL");
  await expect(page.locator("#country")).toHaveAttribute("data-value", "US");
  await expect(page.locator("#state")).toHaveAttribute("data-value", "IL");
  await expect(page.locator("#identity")).toHaveAttribute("data-value", "nonbinary");
});

test("Stored protected answers require explicit confirmation while manual-only fields stay blocked", async ({ page, sidePanel }) => {
  await page.goto("http://privacy.localhost:4327/demos/protected-fields.html");
  await scan(page, sidePanel);

  for (const label of ["Date of birth", "Gender", "Race / Ethnicity", "Disability status", "Veteran status"]) {
    const protectedSuggestion = suggestion(sidePanel, label);
    await expect(protectedSuggestion).toContainText("protected answer");
    await expect(protectedSuggestion.locator('input[type="checkbox"]')).not.toBeChecked();
    await protectedSuggestion.locator('input[type="checkbox"]').check();
  }
  await expect(suggestion(sidePanel, "Social Security Number")).toContainText("manual entry");
  await expect(suggestion(sidePanel, "Account password")).toContainText("manual entry");
  await confirmSelected(sidePanel);

  await expect(page.locator('[name="email"]')).toHaveValue("ada@lovelace.test");
  await expect(page.locator('[name="dateOfBirth"]')).toHaveValue("1990-12-10");
  await expect(page.locator('[name="gender"]')).toHaveValue("Non-binary");
  await expect(page.locator('[name="race"]')).toHaveValue("Prefer not to say");
  await expect(page.locator('[name="disability"]')).toHaveValue("No, I do not have a disability");
  await expect(page.locator('[name="veteran"]')).toHaveValue("I am not a protected veteran");
  await expect(page.locator('[name="ssn"]')).toHaveValue("");

  const session = await prisma.applicationSession.findFirstOrThrow({
    where: { ats_domain: "privacy.localhost" },
  });
  expect(await prisma.suggestionDecisionLog.count({
    where: { application_session_id: session.id, review_status: "blocked" },
  })).toBe(2);
  expect(await prisma.filledFieldLog.count({ where: { application_session_id: session.id } })).toBe(6);
});

test("Context saving parses profile facts, preserves omitted values, and supports corrections", async ({ request, page, sidePanel }) => {
  const firstSave = await request.put("/api/context", {
    data: {
      title: "Candidate profile",
      content: `Full Name: Qaalib Farah
Location:
Minneapolis, Minnesota, USA
Email: qaalib@example.com
Phone: (612) 249-2266
LinkedIn URL: https://linkedin.com/in/qaalib
Work Authorization: Authorized to work in the United States.
Visa Sponsorship: Does not currently require sponsorship.`,
      tags: ["general"],
    },
  });
  expect(firstSave.ok()).toBeTruthy();
  const firstPayload = await firstSave.json();
  expect(firstPayload.parsing.contextRevisionId).toBe(firstPayload.id);
  expect(firstPayload.parsing.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: "location", value: "Minneapolis, Minnesota, USA" }),
    expect.objectContaining({ field: "sponsorship_required", value: false }),
  ]));

  const parsedProfileResponse = await request.get("/api/profile");
  await expect(parsedProfileResponse.json()).resolves.toEqual(expect.objectContaining({
    full_name: "Qaalib Farah",
    first_name: "Qaalib",
    last_name: "Farah",
    city: "Minneapolis",
    state_region: "Minnesota",
    country: "USA",
    email: "qaalib@example.com",
    sponsorship_required: false,
  }));

  const correction = await request.put("/api/context", {
    data: {
      title: "Corrected candidate profile",
      content: "Location: Saint Paul, Minnesota, USA\nVisa Sponsorship: Yes\nPreferred Name: Not set",
      tags: ["general"],
    },
  });
  expect(correction.ok()).toBeTruthy();
  const correctionPayload = await correction.json();

  const correctedProfileResponse = await request.get("/api/profile");
  await expect(correctedProfileResponse.json()).resolves.toEqual(expect.objectContaining({
    full_name: "Qaalib Farah",
    email: "qaalib@example.com",
    preferred_name: null,
    location: "Saint Paul, Minnesota, USA",
    city: "Saint Paul",
    sponsorship_required: true,
  }));
  expect(await prisma.userContextDocument.count({ where: { is_active: true } })).toBe(1);

  await page.goto("http://workday.localhost:4327/demos/workday-personal.html");
  await scan(page, sidePanel);
  await expect(suggestion(sidePanel, "Current Location").locator("input[type='text']"))
    .toHaveValue("Saint Paul, Minnesota, USA");
  const latestLocationSuggestion = await prisma.fieldSuggestion.findFirstOrThrow({
    where: { field_label: "Current Location" },
    orderBy: { created_at: "desc" },
  });
  expect(latestLocationSuggestion.context_revision_id).toBe(correctionPayload.id);
});
