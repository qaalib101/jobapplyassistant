import { prisma } from "../db/prisma";
import { BlockedFieldInfo, FieldMetadata, Suggestion } from "../types";
import { normalizeText } from "../utils/text";
import { effectiveSensitivity } from "./fieldPolicy";

const profileFieldMap: Array<{
  tokens: string[];
  columns: string[];
  label: string;
  namePart?: "first" | "last";
}> = [
  { tokens: ["preferred name", "chosen name"], columns: ["preferred_name"], label: "preferred name" },
  { tokens: ["first name", "given name"], columns: ["first_name", "full_name"], label: "first name", namePart: "first" },
  { tokens: ["middle name"], columns: ["middle_name"], label: "middle name" },
  { tokens: ["last name", "family name", "surname"], columns: ["last_name", "full_name"], label: "last name", namePart: "last" },
  { tokens: ["full name", "legal name", "your name"], columns: ["full_name"], label: "full name" },
  { tokens: ["email address", "email", "e mail"], columns: ["email"], label: "email" },
  { tokens: ["phone number", "mobile number", "phone", "mobile", "telephone"], columns: ["phone"], label: "phone" },
  { tokens: ["street address", "address line 1", "home address"], columns: ["street_address"], label: "street address" },
  { tokens: ["current city", "city"], columns: ["city"], label: "city" },
  { tokens: ["state province", "state region", "state", "province", "region"], columns: ["state_region"], label: "state / region" },
  { tokens: ["postal code", "zip code", "zipcode", "zip"], columns: ["postal_code"], label: "postal code" },
  { tokens: ["country of residence", "country"], columns: ["country"], label: "country" },
  { tokens: ["current location", "place of residence", "location"], columns: ["location"], label: "location" },
  { tokens: ["linkedin"], columns: ["linkedin_url"], label: "LinkedIn" },
  { tokens: ["github"], columns: ["github_url"], label: "GitHub" },
  { tokens: ["portfolio", "personal website", "website"], columns: ["portfolio_url"], label: "portfolio" },
  {
    tokens: ["legally authorized to work", "authorized to work", "work authorization", "employment authorization"],
    columns: ["work_authorization"],
    label: "work authorization",
  },
  { tokens: ["date of birth", "dob", "birth date", "birthday"], columns: ["date_of_birth"], label: "date of birth" },
  { tokens: ["gender identity"], columns: ["gender_identity"], label: "gender identity" },
  { tokens: ["preferred pronouns", "pronouns", "pronoun"], columns: ["pronouns"], label: "pronouns" },
  { tokens: ["gender", "sex"], columns: ["gender"], label: "gender" },
  { tokens: ["race ethnicity", "race", "ethnicity", "ethnic origin"], columns: ["race_ethnicity"], label: "race / ethnicity" },
  { tokens: ["disability status", "disability", "disabled"], columns: ["disability_status"], label: "disability status" },
  { tokens: ["veteran status", "veteran", "military status"], columns: ["veteran_status"], label: "veteran status" },
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
  const booleanSuggestion = yesNoToken(suggestedValue);
  const match = field.options.find(
    (option) =>
      normalizeText(option.label) === normalizedSuggestion ||
      normalizeText(option.value) === normalizedSuggestion ||
      equivalentOption(normalizeText(option.label), normalizedSuggestion) ||
      equivalentOption(normalizeText(option.value), normalizedSuggestion) ||
      (booleanSuggestion !== null &&
        (yesNoToken(option.label) === booleanSuggestion ||
          yesNoToken(option.value) === booleanSuggestion)),
  );
  return match?.value ?? suggestedValue;
}

const equivalentOptionGroups = [
  new Set(["us", "usa", "united states", "united states of america"]),
];

function equivalentOption(left: string, right: string) {
  return equivalentOptionGroups.some((group) => group.has(left) && group.has(right));
}

function yesNoToken(value: string | null | undefined): "yes" | "no" | null {
  const normalized = normalizeText(value);
  if (["yes", "y", "true"].includes(normalized)) return "yes";
  if (["no", "n", "false"].includes(normalized)) return "no";
  if (/\b(?:not|isn t|aren t)\b.*\bauthorized\b.*\bwork\b/.test(normalized)) return "no";
  if (/\bauthorized\b.*\bwork\b/.test(normalized)) return "yes";
  return null;
}

function booleanSuggestion(value: boolean | null | undefined) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return null;
}

function isPlaceholderProfileValue(value: string) {
  return (
    /@example\./i.test(value) ||
    /^555[-.\s]?0?100$/.test(value.trim()) ||
    /^https?:\/\/qaalib\.dev\/?$/i.test(value.trim())
  );
}

function fieldHasAny(text: string, tokens: string[]) {
  const padded = ` ${text} `;
  return tokens.some((token) => padded.includes(` ${normalizeText(token)} `));
}

function profileValue(
  profile: Record<string, unknown>,
  mapping: (typeof profileFieldMap)[number],
) {
  for (const column of mapping.columns) {
    const raw = profile[column];
    if (raw === null || raw === undefined || raw === "") continue;
    let value = String(raw);
    if (mapping.namePart && column === "full_name") value = splitName(value, mapping.namePart);
    return { value, column };
  }
  return null;
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

export async function deterministicSuggestions(
  userProfileId: string,
  fields: FieldMetadata[],
): Promise<{ suggestions: Suggestion[]; blockedFields: BlockedFieldInfo[] }> {
  const profile = ((await prisma.userProfile.findUnique({
    where: { id: userProfileId },
  })) ?? {}) as Record<string, unknown>;

  const answerRows = await prisma.answerBankItem.findMany({
    where: { user_profile_id: userProfileId },
    select: {
      id: true,
      question_key: true,
      question_text: true,
      answer_text: true,
      tags: true,
    },
  });

  const suggestions: Suggestion[] = [];
  const blockedFields: BlockedFieldInfo[] = [];

  for (const field of fields) {
    const text = fieldText(field);
    if (!text || field.type === "file") continue;
    const sensitivity = effectiveSensitivity(field);
    if (sensitivity === "manual-only") {
      blockedFields.push({
        fieldId: field.fieldId,
        fieldLabel: field.label,
        reason: sensitivity,
      });
      continue;
    }

    for (const mapping of profileFieldMap) {
      if (!fieldHasAny(text, mapping.tokens)) continue;
      const matchedProfile = profileValue(profile, mapping);
      if (!matchedProfile) continue;

      let { value } = matchedProfile;
      if (isPlaceholderProfileValue(value)) continue;

      suggestions.push({
        fieldId: field.fieldId,
        fieldLabel: field.label,
        fieldType: field.type,
        suggestedValue: optionValue(field, value),
        confidence: 0.92,
        sourceType: "UserProfile",
        sourceIds: [userProfileId],
        sourceContext: { matched: mapping.label, column: matchedProfile.column },
        isGenerated: false,
        requiresUserReview: true,
      });
      break;
    }

    if (suggestions.some((suggestion) => suggestion.fieldId === field.fieldId)) continue;

    // Protected answers must come from explicit profile data, never fuzzy matching or AI.
    if (sensitivity === "sensitive") {
      blockedFields.push({
        fieldId: field.fieldId,
        fieldLabel: field.label,
        reason: "sensitive-unconfigured",
      });
      continue;
    }

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

    const answerMatch = answerRows
      .map((answer: { id: string; question_key: string | null; question_text: string; answer_text: string; tags: unknown }) => ({ answer, score: answerScore(text, answer) }))
      .filter((item: { answer: { id: string; question_key: string | null; question_text: string; answer_text: string; tags: unknown }; score: number }) => item.score >= 0.35)
      .sort((left: { score: number }, right: { score: number }) => right.score - left.score)[0]?.answer;

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

  return { suggestions, blockedFields };
}
