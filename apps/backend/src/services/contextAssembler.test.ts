import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  work: vi.fn(),
  projects: vi.fn(),
  skills: vi.fn(),
  answers: vi.fn(),
  resumes: vi.fn(),
  contextDocuments: vi.fn(),
}));

vi.mock("../db/prisma", () => ({
  prisma: {
    userProfile: { findUnique: mocks.profile },
    workExperience: { findMany: mocks.work },
    projectExperience: { findMany: mocks.projects },
    skill: { findMany: mocks.skills },
    answerBankItem: { findMany: mocks.answers },
    resumeVersion: { findMany: mocks.resumes },
    userContextDocument: { findMany: mocks.contextDocuments },
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
    mocks.contextDocuments.mockResolvedValue([]);
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
    mocks.contextDocuments.mockResolvedValue([
      {
        id: "context-revision-1",
        title: "Application context",
        content: "Phone: 312-555-0101\nGender: protected-gender\nDate of Birth:\nprotected-dob",
      },
    ]);

    const result = await assembleUserContext("profile-1");

    expect(result.text).toContain("Phone: 312-555-0101");
    expect(result.text).toContain("Gender: [stored as protected profile data]");
    expect(result.text).not.toContain("protected-gender");
    expect(result.text).not.toContain("protected-dob");
    expect(result.summary.contextRevisionId).toBe("context-revision-1");
  });
});
