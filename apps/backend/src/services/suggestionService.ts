import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getFallbackProvider, getProvider } from "../providers";
import { FieldMetadata, Suggestion } from "../types";
import { assembleUserContext } from "./contextAssembler";
import { deterministicSuggestions } from "./fieldMatcher";

function shouldGenerate(field: FieldMetadata, existing: Suggestion[]) {
  if (existing.some((suggestion) => suggestion.fieldId === field.fieldId)) return false;
  if (field.type !== "textarea" && field.type !== "text") return false;
  const label = [field.label, field.name, field.placeholder].filter(Boolean).join(" ");
  if (/\b(gender|race|ethnicity|disability|veteran|birth|ssn|social security)\b/i.test(label)) {
    return false;
  }
  if (field.type === "textarea") return true;
  return /\b(why|describe|tell us|cover letter|additional|summary|experience|interest)\b/i.test(
    label,
  );
}

export async function createSuggestions(input: {
  applicationSessionId: string;
  pageSnapshotId: string;
  userProfileId: string;
  fields: FieldMetadata[];
  jobDescription?: string;
}) {
  const deterministic = await deterministicSuggestions(input.userProfileId, input.fields);
  const suggestions = [...deterministic];
  const provider = getProvider();
  const assembledContext = await assembleUserContext(input.userProfileId);
  const fieldsNeedingAi = input.fields
    .filter((field) => shouldGenerate(field, suggestions))
    .map((field) => ({
      field,
      question: field.label || field.placeholder || field.name || "Application question",
    }));

  if (provider.id !== "none" && fieldsNeedingAi.length > 0) {
    try {
      const drafts = await provider.generateAnswerDrafts({
        fields: fieldsNeedingAi,
        context: assembledContext.text,
        jobDescription: input.jobDescription,
      });
      const fieldById = new Map(fieldsNeedingAi.map(({ field }) => [field.fieldId, field]));
      for (const draft of drafts) {
        const field = fieldById.get(draft.fieldId);
        if (!field) continue;
        suggestions.push({
          fieldId: field.fieldId,
          fieldLabel: field.label,
          fieldType: field.type,
          suggestedValue: draft.text,
          confidence: draft.confidence,
          sourceType: "GeneratedDraft",
          sourceIds: [],
          sourceContext: draft.sourceContext,
          provider: draft.provider,
          model: draft.model,
          promptVersion: "mvp-001",
          isGenerated: true,
          requiresUserReview: true,
        });
      }
    } catch (error) {
      const fallback = getFallbackProvider();
      if (fallback.id !== provider.id && fallback.id !== "none") {
        const drafts = await fallback.generateAnswerDrafts({
          fields: fieldsNeedingAi,
          context: assembledContext.text,
          jobDescription: input.jobDescription,
        });
        const fieldById = new Map(fieldsNeedingAi.map(({ field }) => [field.fieldId, field]));
        for (const draft of drafts) {
          const field = fieldById.get(draft.fieldId);
          if (!field) continue;
          suggestions.push({
            fieldId: field.fieldId,
            fieldLabel: field.label,
            fieldType: field.type,
            suggestedValue: draft.text,
            confidence: draft.confidence,
            sourceType: "GeneratedDraft",
            sourceIds: [],
            sourceContext: {
              ...draft.sourceContext,
              fallbackFrom: provider.id,
              fallbackReason: error instanceof Error ? error.message : "unknown error",
            },
            provider: draft.provider,
            model: draft.model,
            promptVersion: "mvp-001",
            isGenerated: true,
            requiresUserReview: true,
          });
        }
      }
    }
  }

  for (const suggestion of suggestions) {
    await prisma.fieldSuggestion.create({
      data: {
        application_session_id: input.applicationSessionId,
        page_snapshot_id: input.pageSnapshotId,
        field_id: suggestion.fieldId,
        field_label: suggestion.fieldLabel ?? null,
        field_type: suggestion.fieldType,
        suggested_value: suggestion.suggestedValue,
        confidence: suggestion.confidence,
        source_type: suggestion.sourceType,
        source_ids: suggestion.sourceIds,
        source_context: suggestion.sourceContext as Prisma.InputJsonValue,
        provider: suggestion.provider ?? null,
        model: suggestion.model ?? null,
        prompt_version: suggestion.promptVersion ?? null,
        is_generated: suggestion.isGenerated,
        requires_user_review: true,
      },
    });
  }

  return {
    suggestions,
    contextSummary: assembledContext.summary,
  };
}
