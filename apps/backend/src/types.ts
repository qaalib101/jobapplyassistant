export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "unknown";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldMetadata {
  fieldId: string;
  label?: string;
  name?: string;
  id?: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[] | null;
  domPathHash?: string;
  visible?: boolean;
}

export interface Suggestion {
  fieldId: string;
  fieldLabel?: string;
  fieldType: FieldType;
  suggestedValue: string;
  confidence: number;
  sourceType: string;
  sourceIds: string[];
  sourceContext: Record<string, unknown>;
  provider?: string;
  model?: string;
  promptVersion?: string;
  isGenerated: boolean;
  requiresUserReview: true;
}

export interface DraftAnswerInput {
  question: string;
  field: FieldMetadata;
  context: string;
  jobDescription?: string;
}

export interface DraftAnswerResult {
  text: string;
  confidence: number;
  sourceContext: Record<string, unknown>;
  provider: string;
  model?: string;
}

export interface BatchAnswerField {
  field: FieldMetadata;
  question: string;
}

export interface BatchAnswerInput {
  fields: BatchAnswerField[];
  context: string;
  jobDescription?: string;
}

export interface BatchAnswerResult {
  fieldId: string;
  text: string;
  confidence: number;
  sourceContext: Record<string, unknown>;
  provider: string;
  model?: string;
}

export interface AIProvider {
  id: string;
  label: string;
  mode: "remote" | "local" | "disabled";
  configured(): boolean;
  healthCheck(): Promise<boolean>;
  generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult>;
  generateAnswerDrafts(input: BatchAnswerInput): Promise<BatchAnswerResult[]>;
  tailorResume?(input: {
    resumeText: string;
    jobDescription: string;
    userContext: string;
  }): Promise<DraftAnswerResult>;
}
