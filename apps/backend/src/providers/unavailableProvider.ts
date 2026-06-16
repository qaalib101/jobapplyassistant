import { AIProvider, DraftAnswerInput, DraftAnswerResult } from "../types";

export class UnavailableProvider implements AIProvider {
  label: string;
  mode = "disabled" as const;

  constructor(
    public id: string,
    private reason: string,
  ) {
    this.label = `${id} unavailable`;
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

  async tailorResume(): Promise<DraftAnswerResult> {
    throw new Error(this.reason);
  }
}
