import { AIProvider, DraftAnswerInput, DraftAnswerResult } from "../types";

export class NoneProvider implements AIProvider {
  id = "none";
  label = "None";
  mode = "disabled" as const;

  configured() {
    return true;
  }

  async healthCheck() {
    return true;
  }

  async generateAnswerDraft(_input: DraftAnswerInput): Promise<DraftAnswerResult> {
    throw new Error("AI generation is disabled.");
  }

  async tailorResume(): Promise<DraftAnswerResult> {
    throw new Error("AI generation is disabled.");
  }
}
