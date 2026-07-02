import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashValue } from "../utils/text";

// Use vi.hoisted so mock functions are available when vi.mock factory runs
const { mockCreate, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("../db/prisma", () => ({
  prisma: {
    suggestionDecisionLog: {
      create: mockCreate,
      findMany: mockFindMany,
    },
  },
}));

import { logSuggestionDecisions, logBlockedFields, getAuditTrail } from "./auditService";

describe("auditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logSuggestionDecisions", () => {
    it("should create decision log entries with hashed values", async () => {
      mockCreate.mockResolvedValue({ id: "log-1" });

      const result = await logSuggestionDecisions({
        applicationSessionId: "session-1",
        pageSnapshotId: "snapshot-1",
        decisions: [
          {
            fieldId: "field-1",
            reviewStatus: "accepted",
            originalValue: "suggested text",
            provider: "mock",
            confidence: 0.9,
            sourceType: "UserProfile",
          },
        ],
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const callData = mockCreate.mock.calls[0][0].data;
      expect(callData.application_session_id).toBe("session-1");
      expect(callData.page_snapshot_id).toBe("snapshot-1");
      expect(callData.field_id).toBe("field-1");
      expect(callData.review_status).toBe("accepted");
      expect(callData.original_value_hash).toBe(hashValue("suggested text"));
      expect(callData.provider).toBe("mock");
      expect(callData.source_type).toBe("UserProfile");
      expect(result).toHaveLength(1);
    });

    it("should store edited_value_hash only when status is edited", async () => {
      mockCreate.mockResolvedValue({ id: "log-2" });

      await logSuggestionDecisions({
        applicationSessionId: "session-1",
        pageSnapshotId: "snapshot-1",
        decisions: [
          {
            fieldId: "field-1",
            reviewStatus: "edited",
            originalValue: "original",
            editedValue: "modified text",
          },
        ],
      });

      const callData = mockCreate.mock.calls[0][0].data;
      expect(callData.review_status).toBe("edited");
      expect(callData.original_value_hash).toBe(hashValue("original"));
      expect(callData.edited_value_hash).toBe(hashValue("modified text"));
    });

    it("should not store edited_value_hash when status is not edited", async () => {
      mockCreate.mockResolvedValue({ id: "log-3" });

      await logSuggestionDecisions({
        applicationSessionId: "session-1",
        pageSnapshotId: "snapshot-1",
        decisions: [
          {
            fieldId: "field-1",
            reviewStatus: "accepted",
            originalValue: "text",
            editedValue: "should not be stored",
          },
        ],
      });

      const callData = mockCreate.mock.calls[0][0].data;
      expect(callData.edited_value_hash).toBeUndefined();
    });

    it("should handle multiple decisions in one call", async () => {
      mockCreate.mockResolvedValue({ id: "log-multi" });

      await logSuggestionDecisions({
        applicationSessionId: "session-1",
        pageSnapshotId: "snapshot-1",
        decisions: [
          { fieldId: "f1", reviewStatus: "accepted" },
          { fieldId: "f2", reviewStatus: "skipped" },
          { fieldId: "f3", reviewStatus: "rejected" },
        ],
      });

      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe("logBlockedFields", () => {
    it("should create blocked entries without any value hashes", async () => {
      mockCreate.mockResolvedValue({ id: "blocked-1" });

      const result = await logBlockedFields({
        applicationSessionId: "session-1",
        pageSnapshotId: "snapshot-1",
        blockedFields: [
          { fieldId: "ssn-field", fieldLabel: "SSN", reason: "manual-only" },
          { fieldId: "dob-field", fieldLabel: "Date of Birth", reason: "sensitive" },
        ],
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);

      const firstCall = mockCreate.mock.calls[0][0].data;
      expect(firstCall.review_status).toBe("blocked");
      expect(firstCall.field_id).toBe("ssn-field");
      expect(firstCall.source_type).toBe("manual-only");
      expect(firstCall.original_value_hash).toBeUndefined();
      expect(firstCall.edited_value_hash).toBeUndefined();

      const secondCall = mockCreate.mock.calls[1][0].data;
      expect(secondCall.review_status).toBe("blocked");
      expect(secondCall.field_id).toBe("dob-field");
      expect(secondCall.source_type).toBe("sensitive");
      expect(secondCall.original_value_hash).toBeUndefined();

      expect(result).toHaveLength(2);
    });

    it("should never store sensitive values for blocked fields", async () => {
      mockCreate.mockResolvedValue({ id: "blocked-2" });

      await logBlockedFields({
        applicationSessionId: "session-1",
        pageSnapshotId: "snapshot-1",
        blockedFields: [
          { fieldId: "password-field", fieldLabel: "Password", reason: "manual-only" },
        ],
      });

      const callData = mockCreate.mock.calls[0][0].data;
      // Ensure no value-related fields are set
      expect(callData.original_value_hash).toBeUndefined();
      expect(callData.edited_value_hash).toBeUndefined();
      expect(callData.filled_value).toBeUndefined();
      expect(callData.filled_value_redacted).toBeUndefined();
    });
  });

  describe("getAuditTrail", () => {
    it("should return audit entries for a session", async () => {
      const mockEntries = [
        {
          id: "entry-1",
          field_id: "field-1",
          review_status: "accepted",
          original_value_hash: "abc123",
          edited_value_hash: null,
          provider: "mock",
          model: null,
          confidence: 0.9,
          source_type: "UserProfile",
          created_at: new Date(),
        },
        {
          id: "entry-2",
          field_id: "field-2",
          review_status: "blocked",
          original_value_hash: null,
          edited_value_hash: null,
          provider: null,
          model: null,
          confidence: null,
          source_type: "manual-only",
          created_at: new Date(),
        },
      ];
      mockFindMany.mockResolvedValue(mockEntries);

      const result = await getAuditTrail("session-1");

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { application_session_id: "session-1" },
        orderBy: { created_at: "asc" },
        select: {
          id: true,
          field_id: true,
          review_status: true,
          original_value_hash: true,
          edited_value_hash: true,
          provider: true,
          model: true,
          confidence: true,
          source_type: true,
          created_at: true,
        },
      });
      expect(result).toHaveLength(2);
      expect(result[0].review_status).toBe("accepted");
      expect(result[1].review_status).toBe("blocked");
    });
  });
});