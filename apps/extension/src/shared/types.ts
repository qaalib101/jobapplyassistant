export interface FieldOption {
  label: string;
  value: string;
}

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
