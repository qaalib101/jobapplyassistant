import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  work: vi.fn(),
  projects: vi.fn(),
  skills: vi.fn(),
  answers: vi.fn(),
  resumes: vi.fn(),
  contextDocument: vi.fn(),
}));

vi.mock("../db/prisma", () => ({
  prisma: {
    userProfile: { findUnique: mocks.profile },
    workExperience: { findMany: mocks.work },
    projectExperience: { findMany: mocks.projects },
    skill: { findMany: mocks.skills },
    answerBankItem: { findMany: mocks.answers },
    resumeVersion: { findMany: mocks.resumes },
    userContextDocument: { findFirst: mocks.contextDocument },
  },
}));

import { assembleUserContext } from "./contextAssembler";

describe("AI context assembly", () => {
  beforeEach(() => {
    mocks.work.mockResolvedValue([]);
    mocks.projects.mockResolvedValue([]);
    mocks.skills.mockResolvedValue([]);
    mocks.answers.mockResolvedValue([]);
    mocks.resumes.mockResolvedValue([]);
    mocks.contextDocument.mockResolvedValue(null);
  });

  it("does not automatically disclose structured protected profile answers to AI providers", async () => {
    mocks.profile.mockResolvedValue({
      id: "profile-1",
      phone: "312-555-0101",
      street_address: "protected-street",
      date_of_birth: "protected-dob",
      gender: "protected-gender",
      gender_identity: "protected-gender-identity",
      pronouns: "protected-pronouns",
      race_ethnicity: "protected-race",
      disability_status: "protected-disability",
      veteran_status: "protected-veteran",
    });

    const result = await assembleUserContext("profile-1");

    expect(result.text).toContain("312-555-0101");
    expect(result.text).not.toContain("protected-street");
    expect(result.text).not.toContain("protected-dob");
    expect(result.text).not.toContain("protected-gender");
    expect(result.text).not.toContain("protected-gender-identity");
    expect(result.text).not.toContain("protected-pronouns");
    expect(result.summary.contextRevisionId).toBeNull();
    expect(result.text).not.toContain("protected-race");
    expect(result.text).not.toContain("protected-disability");
    expect(result.text).not.toContain("protected-veteran");
  });

  it("redacts recognized protected labels from uploaded context before AI use", async () => {
    mocks.profile.mockResolvedValue({ id: "profile-1" });
    mocks.contextDocument.mockResolvedValue({
      id: "context-revision-1",
      title: "Application context",
      content: [
        "Phone: 312-555-0101",
        "- **Gender Identity**: protected-gender-identity",
        "Birth Date:",
        "protected-dob",
        "Preferred Pronouns: protected-pronouns",
        "Military Status: protected-veteran",
        "Age Bracket: protected-age",
      ].join("\n"),
    });

    const result = await assembleUserContext("profile-1");

    expect(result.text).toContain("Phone: 312-555-0101");
    expect(result.text).toContain("Gender Identity: [stored as protected profile data]");
    expect(result.text).not.toContain("protected-gender-identity");
    expect(result.text).not.toContain("protected-dob");
    expect(result.text).not.toContain("protected-pronouns");
    expect(result.text).not.toContain("protected-veteran");
    expect(result.text).not.toContain("protected-age");
    expect(result.summary.contextRevisionId).toBe("context-revision-1");
    expect(mocks.contextDocument).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { updated_at: "desc" },
    }));
  });

  it("keeps every context source represented when the total exceeds the provider limit", async () => {
    mocks.profile.mockResolvedValue({ id: "profile-1", full_name: "Ada Lovelace" });
    mocks.work.mockResolvedValue([{ company: "Engine Co", description: "w".repeat(20_000) }]);
    mocks.answers.mockResolvedValue([{ question_text: "Why us?", answer_text: "a".repeat(20_000) }]);
    mocks.resumes.mockResolvedValue([{ label: "Base", target_role: null, parsed_text: "r".repeat(20_000) }]);
    mocks.contextDocument.mockResolvedValue({ id: "latest", title: "Latest", content: "c".repeat(20_000) });

    const result = await assembleUserContext("profile-1");

    expect(result.text.length).toBeLessThanOrEqual(30_000);
    expect(result.text).toContain("UPLOADED APPLICATION ASSISTANT CONTEXT");
    expect(result.text).toContain("STRUCTURED PROFILE DATA");
    expect(result.text).toContain("SAVED ANSWER BANK");
    expect(result.text).toContain("RESUME VERSIONS");
    expect(result.summary).toMatchObject({ uploadedContextCount: 1, contextRevisionId: "latest" });
  });
});
