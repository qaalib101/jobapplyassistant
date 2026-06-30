import { BatchAnswerInput, DraftAnswerInput, DraftAnswerResult } from "../types";
import { BaseProvider } from "./baseProvider";

export class UnavailableProvider extends BaseProvider {
  private reason: string;

  constructor(id: string, reason: string) {
    super(id, `${id} unavailable`, "disabled");
    this.reason = reason;
  }

  configured() {
    return false;
  }

  async healthCheck() {
    return false;
  }

  async generateAnswerDraft(_input: DraftAnswerInput): Promise<DraftAnswerResult> {
    throw new Error(this.reason);
  }

  async generateAnswerDrafts(_input: BatchAnswerInput): Promise<never> {
    throw new Error(this.reason);
  }

  async tailorResume(_input: { resumeText: string; jobDescription: string; userContext: string }): Promise<DraftAnswerResult> {
    throw new Error(this.reason);
  }
}
