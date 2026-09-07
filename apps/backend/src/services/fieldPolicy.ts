import type { FieldMetadata, FieldSensitivity } from "../types";
import { normalizeText } from "../utils/text";

const manualOnlyTokens = [
  "ssn",
  "social security",
  "password",
  "confirm password",
];

const sensitiveTokens = [
  "gender",
  "sex",
  "race",
  "ethnicity",
  "ethnic origin",
  "demographic",
  "eeo",
  "equal employment",
  "disability",
  "disabled",
  "veteran",
  "military status",
  "date of birth",
  "dob",
  "birth date",
  "birthday",
  "pronoun",
];

const sensitivityRank: Record<FieldSensitivity, number> = {
  normal: 0,
  sensitive: 1,
  "manual-only": 2,
};

export function inferredSensitivity(field: FieldMetadata): FieldSensitivity {
  if (field.type === "password") return "manual-only";

  const text = normalizeText(
    [field.label, field.name, field.id, field.placeholder].filter(Boolean).join(" "),
  );
  if (manualOnlyTokens.some((token) => text.includes(normalizeText(token)))) {
    return "manual-only";
  }
  if (sensitiveTokens.some((token) => text.includes(normalizeText(token)))) {
    return "sensitive";
  }
  return "normal";
}

export function effectiveSensitivity(field: FieldMetadata): FieldSensitivity {
  const declared = field.sensitivity ?? "normal";
  const inferred = inferredSensitivity(field);
  return sensitivityRank[inferred] > sensitivityRank[declared] ? inferred : declared;
}
