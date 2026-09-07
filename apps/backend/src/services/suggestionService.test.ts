import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSuggestion: vi.fn(),
  createAiLog: vi.fn(),
  deterministicSuggestions: vi.fn(),
  assembleUserContext: vi.fn(),
  logBlockedFields: vi.fn(),
  generateAnswerDrafts: vi.fn(),
}));

vi.mock("../db/prisma", () => ({
  prisma: {
    fieldSuggestion: { create: mocks.createSuggestion },
    aIRequestLog: { create: mocks.createAiLog },
  },
}));
vi.mock("./fieldMatcher", () => ({ deterministicSuggestions: mocks.deterministicSuggestions }));
vi.mock("./contextAssembler", () => ({ assembleUserContext: mocks.assembleUserContext }));
vi.mock("./auditService", () => ({ logBlockedFields: mocks.logBlockedFields }));
vi.mock("../providers", () => ({
  getProvider: () => ({ id: "mock", generateAnswerDrafts: mocks.generateAnswerDrafts }),
  getFallbackProvider: () => ({ id: "none" }),
}));

import { createSuggestions } from "./suggestionService";

describe("suggestion creation contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assembleUserContext.mockResolvedValue({
      text: "known context",
      summary: {
        profilePresent: true,
        answerCount: 0,
        resumeCount: 0,
        uploadedContextCount: 0,
        uploadedContextChars: 0,
        contextRevisionId: "context-revision-1",
      },
    });
    mocks.createAiLog.mockResolvedValue({ id: "ai-log" });
    mocks.logBlockedFields.mockResolvedValue([]);
  });

  it("returns the persisted ID needed by decisions and fill logs", async () => {
    mocks.deterministicSuggestions.mockResolvedValue({
      suggestions: [
        {
          fieldId: "email",
          fieldLabel: "Email",
          fieldType: "email",
          suggestedValue: "ada@example.com",
          confidence: 0.92,
          sourceType: "UserProfile",
          sourceIds: ["profile-1"],
          sourceContext: {},
          isGenerated: false,
          requiresUserReview: true,
        },
      ],
      blockedFields: [],
    });
    mocks.createSuggestion.mockResolvedValue({ id: "suggestion-1" });

    const result = await createSuggestions({
      applicationSessionId: "session-1",
      pageSnapshotId: "snapshot-1",
      userProfileId: "profile-1",
      fields: [{ fieldId: "email", label: "Email", type: "email" }],
    });

    expect(result.suggestions[0].id).toBe("suggestion-1");
    expect(result.suggestions[0].contextRevisionId).toBe("context-revision-1");
    expect(mocks.createSuggestion).toHaveBeenCalledWith({
      data: expect.objectContaining({ context_revision_id: "context-revision-1" }),
    });
  });

  it("never sends a protected field to the AI provider", async () => {
    const protectedField = {
      fieldId: "eeo-response",
      label: "Optional response",
      type: "textarea" as const,
      sensitivity: "sensitive" as const,
    };
    mocks.deterministicSuggestions.mockResolvedValue({
      suggestions: [],
      blockedFields: [{ fieldId: protectedField.fieldId, reason: "sensitive" }],
    });

    const result = await createSuggestions({
      applicationSessionId: "session-1",
      pageSnapshotId: "snapshot-1",
      userProfileId: "profile-1",
      fields: [protectedField],
    });

    expect(mocks.generateAnswerDrafts).not.toHaveBeenCalled();
    expect(mocks.logBlockedFields).toHaveBeenCalledOnce();
    expect(result.suggestions).toEqual([]);
  });

  it("sends the latest safe context to AI and records its revision", async () => {
    mocks.deterministicSuggestions.mockResolvedValue({ suggestions: [], blockedFields: [] });
    mocks.generateAnswerDrafts.mockResolvedValue([{
      fieldId: "summary",
      text: "A grounded draft",
      confidence: 0.8,
      sourceContext: { contextUsed: "saved context" },
      provider: "mock",
    }]);
    mocks.createSuggestion.mockResolvedValue({ id: "suggestion-2" });

    await createSuggestions({
      applicationSessionId: "session-1",
      pageSnapshotId: "snapshot-1",
      userProfileId: "profile-1",
      fields: [{ fieldId: "summary", label: "Tell us about your experience", type: "textarea" }],
    });

    expect(mocks.generateAnswerDrafts).toHaveBeenCalledWith(expect.objectContaining({
      context: "known context",
    }));
    expect(mocks.createAiLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        input_summary: expect.objectContaining({ contextRevisionId: "context-revision-1" }),
      }),
    });
    expect(mocks.createSuggestion).toHaveBeenCalledWith({
      data: expect.objectContaining({ context_revision_id: "context-revision-1" }),
    });
  });
});
