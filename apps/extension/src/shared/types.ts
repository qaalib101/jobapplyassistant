export interface FieldOption {
  label: string;
  value: string;
}

export type FieldSensitivity = "normal" | "sensitive" | "manual-only";

export type FieldCategory =
  | "contact"
  | "personal"
  | "work"
  | "demographic"
  | "eeo"
  | "disability"
  | "veteran"
  | "gender"
  | "race"
  | "unknown";

export interface FieldMetadata {
  fieldId: string;
  label?: string;
  name?: string;
  id?: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[] | null;
  domPathHash?: string;
  visible?: boolean;
  currentValue?: string;
  checked?: boolean;
  sensitivity?: FieldSensitivity;
  category?: FieldCategory;
}

export interface Suggestion {
  fieldId: string;
  fieldLabel?: string;
  fieldType: string;
  suggestedValue: string;
  confidence: number;
  sourceType: string;
  sourceContext: Record<string, unknown>;
  provider?: string;
  model?: string;
  isGenerated: boolean;
  requiresUserReview: true;
}
