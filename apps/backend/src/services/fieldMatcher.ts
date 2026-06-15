import { pool } from "../db/pool";
import { FieldMetadata, Suggestion } from "../types";
import { normalizeText } from "../utils/text";

const profileFieldMap: Array<{
  tokens: string[];
  column: string;
  label: string;
}> = [
  { tokens: ["first name", "given name"], column: "full_name", label: "first name" },
  { tokens: ["last name", "family name", "surname"], column: "full_name", label: "last name" },
  { tokens: ["full name", "legal name", "name"], column: "full_name", label: "full name" },
  { tokens: ["email", "e mail"], column: "email", label: "email" },
  { tokens: ["phone", "mobile", "telephone"], column: "phone", label: "phone" },
  { tokens: ["location", "city", "address"], column: "location", label: "location" },
  { tokens: ["linkedin"], column: "linkedin_url", label: "LinkedIn" },
  { tokens: ["github"], column: "github_url", label: "GitHub" },
  { tokens: ["portfolio", "website"], column: "portfolio_url", label: "portfolio" },
  {
    tokens: ["authorized", "work authorization"],
    column: "work_authorization",
    label: "work authorization",
  },
];

function fieldText(field: FieldMetadata) {
  return normalizeText(
    [field.label, field.name, field.id, field.placeholder].filter(Boolean).join(" "),
  );
}

function splitName(value: string, part: "first" | "last") {
  const pieces = value.trim().split(/\s+/);
  if (part === "first") return pieces[0] ?? value;
  return pieces.length > 1 ? pieces[pieces.length - 1] : value;
}

function optionValue(field: FieldMetadata, suggestedValue: string): string {
  if (!field.options?.length) return suggestedValue;
  const normalizedSuggestion = normalizeText(suggestedValue);
  const match = field.options.find(
    (option) =>
      normalizeText(option.label) === normalizedSuggestion ||
      normalizeText(option.value) === normalizedSuggestion,
  );
  return match?.value ?? suggestedValue;
}

export async function deterministicSuggestions(
  userProfileId: string,
  fields: FieldMetadata[],
): Promise<Suggestion[]> {
  const profileResult = await pool.query("SELECT * FROM user_profiles WHERE id = $1", [
    userProfileId,
  ]);
  const profile = profileResult.rows[0] ?? {};

  const answerResult = await pool.query(
    "SELECT id, question_key, question_text, answer_text, tags FROM answer_bank_items WHERE user_profile_id = $1",
    [userProfileId],
  );

  const suggestions: Suggestion[] = [];

  for (const field of fields) {
    const text = fieldText(field);
    if (!text || field.type === "file") continue;

    for (const mapping of profileFieldMap) {
      if (!mapping.tokens.some((token) => text.includes(normalizeText(token)))) continue;
      const raw = profile[mapping.column];
      if (!raw) continue;

      let value = String(raw);
      if (mapping.label === "first name") value = splitName(value, "first");
      if (mapping.label === "last name") value = splitName(value, "last");

      suggestions.push({
        fieldId: field.fieldId,
        fieldLabel: field.label,
        fieldType: field.type,
        suggestedValue: optionValue(field, value),
        confidence: 0.92,
        sourceType: "UserProfile",
        sourceIds: [userProfileId],
        sourceContext: { matched: mapping.label, column: mapping.column },
        isGenerated: false,
        requiresUserReview: true,
      });
      break;
    }

    if (suggestions.some((suggestion) => suggestion.fieldId === field.fieldId)) continue;

    const answerMatch = answerResult.rows.find((answer) => {
      const question = normalizeText(answer.question_text);
      const key = normalizeText(answer.question_key);
      return (
        question.includes(text) ||
        text.includes(question) ||
        Boolean(key && text.includes(key))
      );
    });

    if (answerMatch) {
      suggestions.push({
        fieldId: field.fieldId,
        fieldLabel: field.label,
        fieldType: field.type,
        suggestedValue: optionValue(field, answerMatch.answer_text),
        confidence: 0.86,
        sourceType: "AnswerBankItem",
        sourceIds: [answerMatch.id],
        sourceContext: {
          questionText: answerMatch.question_text,
          tags: answerMatch.tags,
        },
        isGenerated: false,
        requiresUserReview: true,
      });
    }
  }

  return suggestions;
}
