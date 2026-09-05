import { prisma } from "../db/prisma";
import { hashValue, redactValue } from "../utils/text";

export interface FillAttempt {
  fieldSuggestionId?: string;
  fieldId: string;
  fieldLabel?: string;
  filled: boolean;
  filledValue?: string;
  skipped?: string;
}

export async function logFillAttempts(input: {
  applicationSessionId: string;
  pageSnapshotId: string;
  fields: FillAttempt[];
}) {
  const created = [];

  for (const field of input.fields) {
    const value = field.filled ? field.filledValue : undefined;
    const log = await prisma.filledFieldLog.create({
      data: {
        application_session_id: input.applicationSessionId,
        page_snapshot_id: input.pageSnapshotId,
        field_suggestion_id: field.fieldSuggestionId ?? null,
        field_id: field.fieldId,
        field_label: field.fieldLabel ?? null,
        filled_value_redacted: value !== undefined ? redactValue(value) : null,
        value_hash: value !== undefined ? hashValue(value) : null,
        fill_succeeded: field.filled,
        failure_reason: field.filled ? null : field.skipped ?? "fill-failed",
        user_confirmed: true,
      },
    });
    created.push(log);
  }

  return created;
}
