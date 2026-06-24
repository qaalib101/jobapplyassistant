import { AIProvider, DraftAnswerInput, DraftAnswerResult } from "../types";
import { BaseProvider } from "./baseProvider";

export class NoneProvider extends BaseProvider {
  id = "none";
  label = "None";
  mode = "disabled" as const;

  constructor() {
    super("none", "None", "disabled");
  }

  configured() {
    return true;
  }

  async healthCheck() {
    return true;
  }

  async generateAnswerDraft(_input: DraftAnswerInput): Promise<DraftAnswerResult> {
    throw new Error("No AI provider configured");
  }

  async generateAnswerDrafts(): Promise<never> {
    throw new Error("No AI provider configured");
  }

  async tailorResume(): Promise<DraftAnswerResult> {
    throw new Error("AI generation is disabled.");
  }
}
