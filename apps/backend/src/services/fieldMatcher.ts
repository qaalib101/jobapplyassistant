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

const sensitiveGeneratedSkip = [
  "gender",
  "race",
  "ethnicity",
  "disability",
  "veteran",
  "date of birth",
  "birth date",
  "ssn",
  "social security",
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
      normalizeText(option.value) === normalizedSuggestion ||
      yesNoToken(option.label) === yesNoToken(suggestedValue) ||
      yesNoToken(option.value) === yesNoToken(suggestedValue),
  );
  return match?.value ?? suggestedValue;
}

function yesNoToken(value: string | null | undefined): "yes" | "no" | null {
  const normalized = normalizeText(value);
  if (["yes", "y", "true"].includes(normalized)) return "yes";
  if (["no", "n", "false"].includes(normalized)) return "no";
  return null;
}

function booleanSuggestion(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return null;
}

function fieldHasAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(normalizeText(token)));
}

function answerScore(fieldTextValue: string, answer: {
  question_key?: string | null;
  question_text: string;
  tags?: unknown;
}) {
  const question = normalizeText(answer.question_text);
  const key = normalizeText(answer.question_key);
  const tagText = Array.isArray(answer.tags)
    ? normalizeText(answer.tags.join(" "))
    : normalizeText(JSON.stringify(answer.tags ?? ""));
  const searchText = [question, key, tagText].filter(Boolean).join(" ");

  if (!searchText) return 0;
  if (question.includes(fieldTextValue) || fieldTextValue.includes(question)) return 0.92;
  if (key && fieldTextValue.includes(key)) return 0.88;

  const fieldTokens = new Set(fieldTextValue.split(" ").filter((token) => token.length > 2));
  const answerTokens = new Set(searchText.split(" ").filter((token) => token.length > 2));
  const overlap = Array.from(fieldTokens).filter((token) => answerTokens.has(token)).length;
  return overlap / Math.max(4, fieldTokens.size);
}

function shouldSkipField(text: string) {
  return sensitiveGeneratedSkip.some((token) => text.includes(normalizeText(token)));
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
    if (shouldSkipField(text)) continue;

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

    if (
      fieldHasAny(text, ["sponsorship", "visa sponsor", "employer sponsorship"]) &&
      profile.sponsorship_required !== null &&
      profile.sponsorship_required !== undefined
    ) {
      const value = booleanSuggestion(Boolean(profile.sponsorship_required));
      if (value) {
        suggestions.push({
          fieldId: field.fieldId,
          fieldLabel: field.label,
          fieldType: field.type,
          suggestedValue: optionValue(field, value),
          confidence: 0.9,
          sourceType: "UserProfile",
          sourceIds: [userProfileId],
          sourceContext: {
            matched: "sponsorship required",
            column: "sponsorship_required",
          },
          isGenerated: false,
          requiresUserReview: true,
        });
        continue;
      }
    }

    const answerMatch = answerResult.rows
      .map((answer) => ({ answer, score: answerScore(text, answer) }))
      .filter((item) => item.score >= 0.35)
      .sort((left, right) => right.score - left.score)[0]?.answer;

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
