import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { hashValue } from "../utils/text";
import type { SuggestionDecision, BlockedFieldInfo } from "../types";

export async function logSuggestionDecisions(input: {
  applicationSessionId: string;
  pageSnapshotId: string;
  decisions: SuggestionDecision[];
}) {
  const created = [];

  for (const decision of input.decisions) {
    const data: Prisma.SuggestionDecisionLogCreateInput = {
      application_session: { connect: { id: input.applicationSessionId } },
      page_snapshot: { connect: { id: input.pageSnapshotId } },
      field_suggestion: decision.fieldSuggestionId
        ? { connect: { id: decision.fieldSuggestionId } }
        : undefined,
      field_id: decision.fieldId,
      review_status: decision.reviewStatus,
      provider: decision.provider ?? null,
      model: decision.model ?? null,
      confidence:
        decision.confidence !== undefined
          ? new Prisma.Decimal(decision.confidence)
          : null,
      source_type: decision.sourceType ?? null,
    };

    // Only store hashes, never raw values
    if (decision.originalValue) {
      data.original_value_hash = hashValue(decision.originalValue);
    }
    if (decision.editedValue && decision.reviewStatus === "edited") {
      data.edited_value_hash = hashValue(decision.editedValue);
    }

    const log = await prisma.suggestionDecisionLog.create({ data });
    created.push(log);
  }

  return created;
}

export async function logBlockedFields(input: {
  applicationSessionId: string;
  pageSnapshotId: string;
  blockedFields: BlockedFieldInfo[];
}) {
  const created = [];

  for (const field of input.blockedFields) {
    const log = await prisma.suggestionDecisionLog.create({
      data: {
        application_session: { connect: { id: input.applicationSessionId } },
        page_snapshot: { connect: { id: input.pageSnapshotId } },
        field_id: field.fieldId,
        review_status: "blocked",
        source_type: field.reason,
        // No value hashes for blocked fields — privacy preserved
      },
    });
    created.push(log);
  }

  return created;
}

export async function getAuditTrail(applicationSessionId: string) {
  const decisions = await prisma.suggestionDecisionLog.findMany({
    where: { application_session_id: applicationSessionId },
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

  return decisions;
}