import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashValue, redactValue } from "../utils/text";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("../db/prisma", () => ({
  prisma: { filledFieldLog: { create: mockCreate } },
}));

import { logFillAttempts } from "./fillAuditService";

describe("fill attempt auditing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "fill-log" });
  });

  it("links and redacts a verified successful fill", async () => {
    await logFillAttempts({
      applicationSessionId: "session-1",
      pageSnapshotId: "snapshot-1",
      fields: [
        {
          fieldSuggestionId: "suggestion-1",
          fieldId: "email",
          fieldLabel: "Email",
          filled: true,
          filledValue: "ada@example.com",
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        application_session_id: "session-1",
        page_snapshot_id: "snapshot-1",
        field_suggestion_id: "suggestion-1",
        fill_succeeded: true,
        failure_reason: null,
        filled_value_redacted: redactValue("ada@example.com"),
        value_hash: hashValue("ada@example.com"),
      }),
    });
  });

  it("records a failed attempt without storing the attempted value", async () => {
    await logFillAttempts({
      applicationSessionId: "session-1",
      pageSnapshotId: "snapshot-1",
      fields: [
        {
          fieldId: "missing",
          filled: false,
          filledValue: "must not be persisted",
          skipped: "element-not-found",
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fill_succeeded: false,
        failure_reason: "element-not-found",
        filled_value_redacted: null,
        value_hash: null,
      }),
    });
  });
});
