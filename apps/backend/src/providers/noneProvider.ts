import {
  AIProvider,
  BatchAnswerInput,
  BatchAnswerResult,
  DraftAnswerInput,
  DraftAnswerResult,
  FieldMetadata,
} from "../types";
import { BaseProvider } from "./baseProvider";

export class NoneProvider extends BaseProvider implements AIProvider {
  id = "none";
  label = "None";
  mode = "disabled" as const;

  constructor() {
    super("none", "None", "disabled");
  }

  configured() {
    return false;
  }

  async healthCheck() {
    return false;
  }

  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    throw new Error(`No provider configured for field ${input.field.fieldId}`);
  }

  async generateAnswerDrafts(input: BatchAnswerInput): Promise<BatchAnswerResult[]> {
    const errors = input.fields.map((field) => ({
      fieldId: field.field.fieldId,
      text: "",
      confidence: 0,
      sourceContext: {},
      provider: this.id,
      model: undefined
    }));
    return errors;
  }

  async tailorResume(input: {
    resumeText: string;
    jobDescription: string;
    userContext: string;
  }): Promise<DraftAnswerResult> {
    throw new Error("No provider configured for resume tailoring");
  }
}
