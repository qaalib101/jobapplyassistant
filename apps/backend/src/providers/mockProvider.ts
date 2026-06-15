import { AIProvider, DraftAnswerInput, DraftAnswerResult } from "../types";

export class MockProvider implements AIProvider {
  id = "mock";
  label = "Mock";
  mode = "local" as const;

  configured() {
    return true;
  }

  async healthCheck() {
    return true;
  }

  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    return {
      text: `Draft answer for "${input.question}". Review and personalize before using.`,
      confidence: 0.35,
      sourceContext: {
        contextUsed: "mock",
        fieldId: input.field.fieldId,
      },
      provider: this.id,
    };
  }
}
