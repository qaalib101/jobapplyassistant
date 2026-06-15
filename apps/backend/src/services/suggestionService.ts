import { pool } from "../db/pool";
import { getFallbackProvider, getProvider } from "../providers";
import { FieldMetadata, Suggestion } from "../types";
import { assembleUserContext } from "./contextAssembler";
import { deterministicSuggestions } from "./fieldMatcher";

function shouldGenerate(field: FieldMetadata, existing: Suggestion[]) {
  if (existing.some((suggestion) => suggestion.fieldId === field.fieldId)) return false;
  if (field.type !== "textarea" && field.type !== "text") return false;
  const label = [field.label, field.name, field.placeholder].filter(Boolean).join(" ");
  return /\b(why|describe|tell us|cover letter|additional|summary|experience|interest)\b/i.test(
    label,
  );
}

export async function createSuggestions(input: {
  applicationSessionId: string;
  pageSnapshotId: string;
  userProfileId: string;
  fields: FieldMetadata[];
}) {
  const deterministic = await deterministicSuggestions(input.userProfileId, input.fields);
  const suggestions = [...deterministic];
  const provider = getProvider();

  if (provider.id !== "none") {
    const context = await assembleUserContext(input.userProfileId);
    for (const field of input.fields) {
      if (!shouldGenerate(field, suggestions)) continue;

      try {
        const draft = await provider.generateAnswerDraft({
          question: field.label || field.placeholder || field.name || "Application question",
          field,
          context,
        });
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
      } catch (error) {
        const fallback = getFallbackProvider();
        if (fallback.id === provider.id || fallback.id === "none") continue;
        const draft = await fallback.generateAnswerDraft({
          question: field.label || field.placeholder || field.name || "Application question",
          field,
          context,
        });
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

  for (const suggestion of suggestions) {
    await pool.query(
      `
        INSERT INTO field_suggestions (
          application_session_id,
          page_snapshot_id,
          field_id,
          field_label,
          field_type,
          suggested_value,
          confidence,
          source_type,
          source_ids,
          source_context,
          provider,
          model,
          prompt_version,
          is_generated,
          requires_user_review
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true)
      `,
      [
        input.applicationSessionId,
        input.pageSnapshotId,
        suggestion.fieldId,
        suggestion.fieldLabel ?? null,
        suggestion.fieldType,
        suggestion.suggestedValue,
        suggestion.confidence,
        suggestion.sourceType,
        JSON.stringify(suggestion.sourceIds),
        JSON.stringify(suggestion.sourceContext),
        suggestion.provider ?? null,
        suggestion.model ?? null,
        suggestion.promptVersion ?? null,
        suggestion.isGenerated,
      ],
    );
  }

  return suggestions;
}
