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

export type ReviewStatus =
  | "pending"
  | "accepted"
  | "edited"
  | "rejected"
  | "skipped"
  | "blocked";

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

export interface SuggestionDecision {
  fieldId: string;
  fieldSuggestionId?: string;
  reviewStatus: ReviewStatus;
  editedValue?: string;
  originalValue?: string;
  provider?: string;
  model?: string;
  confidence?: number;
  sourceType?: string;
}

export interface BlockedFieldInfo {
  fieldId: string;
  fieldLabel?: string;
  reason: string;
}
