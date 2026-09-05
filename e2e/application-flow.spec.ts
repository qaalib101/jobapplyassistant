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
      email: "ada@lovelace.test",
      phone: "312-555-0101",
      location: "Chicago, IL",
      linkedinUrl: "https://linkedin.com/in/ada",
      githubUrl: "https://github.com/ada",
      portfolioUrl: "https://ada.dev",
      workAuthorization: "Yes",
      sponsorshipRequired: false,
      dateOfBirth: "1990-12-10",
      gender: "Non-binary",
      raceEthnicity: "Prefer not to say",
      disabilityStatus: "No, I do not have a disability",
      veteranStatus: "I am not a protected veteran",
    },
  });
  expect(profileResponse.ok()).toBeTruthy();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("Companion UI saves reusable career context", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByText("Data sources loaded.")).toBeVisible();

  await page.getByLabel("Title", { exact: true }).fill("E2E career context");
  await page.getByLabel("AI context", { exact: true }).fill(
    "Primary strengths: analytical engines, TypeScript platforms, and dependable documentation.",
  );
  await page.getByRole("button", { name: "Save context" }).click();
  await expect(page.getByText(/Saved \d+ characters\./)).toBeVisible();

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
  expect(await prisma.aIRequestLog.count({ where: { application_session_id: session.id, provider: "mock", success: true } })).toBe(1);
  expect(await prisma.filledFieldLog.count({ where: { application_session_id: session.id, fill_succeeded: true } })).toBeGreaterThan(5);
  expect(await prisma.filledFieldLog.count({ where: { application_session_id: session.id, field_suggestion_id: null } })).toBe(0);
  expect(await prisma.suggestionDecisionLog.count({ where: { application_session_id: session.id, field_suggestion_id: { not: null } } })).toBeGreaterThan(5);
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
