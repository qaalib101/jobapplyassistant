import { config } from "../config";
import {
  AIProvider,
  BatchAnswerInput,
  BatchAnswerResult,
  DraftAnswerInput,
  DraftAnswerResult,
} from "../types";
import { extractJsonObject } from "./json";
import { BaseProvider } from "./baseProvider";

export class OllamaProvider extends BaseProvider {
  id = "ollama";
  label = "Ollama";
  mode = "local" as const;

  constructor() {
    super("ollama", "Ollama", "local");
  }

  configured() {
    return Boolean(config.ollama.baseUrl && config.ollama.model);
  }

  async healthCheck() {
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateAnswerDrafts(input: BatchAnswerInput): Promise<BatchAnswerResult[]> {
    const { controller, timeoutId } = this.createTimeoutController();
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ollama.model,
          stream: false,
          prompt: [
            "Draft concise job application answers from the provided user context.",
            "Do not invent credentials. Return valid JSON only.",
            'Return exactly {"answers":[{"fieldId":"string","answer":"string","confidence":0.0,"sourceContext":{"contextUsed":"string","usedUploadedContext":true},"needsReview":true}]}',
            `Fields/questions: ${JSON.stringify(input.fields)}`,
            `Scanned job description/page text: ${input.jobDescription ?? "Not provided"}`,
            `User context: ${input.context}`,
          ].join("\n\n"),
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with ${response.status}`);
      }

      const payload = (await response.json()) as { response?: string };
      const text = payload.response?.trim();
      if (!text) throw new Error("Ollama returned no draft text.");

      const parsed = extractJsonObject<{
        answers?: Array<{
          fieldId?: string;
          answer?: string;
          confidence?: number;
          sourceContext?: Record<string, unknown>;
          needsReview?: boolean;
        }>;
      }>(text);
      const validFieldIds = new Set(input.fields.map(({ field }) => field.fieldId));
      return (parsed.answers ?? [])
        .filter((answer) => answer.fieldId && validFieldIds.has(answer.fieldId) && answer.answer)
        .map((answer) => ({
          fieldId: answer.fieldId!,
          text: answer.answer!,
          confidence: Math.max(0, Math.min(1, answer.confidence ?? 0.55)),
          sourceContext: this.createSourceContext(
            {
              contextUsed:
                (answer.sourceContext as Record<string, unknown>)?.contextUsed as string ??
                "batch_profile_resume_answer_bank_uploaded_context_job_description",
              needsReview: answer.needsReview ?? true,
            },
            this.id,
            config.ollama.model
          ),
          provider: this.id,
          model: config.ollama.model,
        }));
    } finally {
      this.clearTimeout(timeoutId);
    }
  }

  async tailorResume(input: {
    resumeText: string;
    jobDescription: string;
    userContext: string;
  }): Promise<DraftAnswerResult> {
    const { controller, timeoutId } = this.createTimeoutController();
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ollama.model,
          stream: false,
          prompt: [
            "Tailor a resume draft for the job description.",
            "Preserve truthful experience. Do not invent credentials. Return only the revised resume text.",
            `Original resume:\n${input.resumeText}`,
            `Job description:\n${input.jobDescription}`,
            `Additional user context:\n${input.userContext}`,
          ].join("\n\n"),
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with ${response.status}`);
      }

      const payload = (await response.json()) as { response?: string };
      const text = payload.response?.trim();
      if (!text) throw new Error("Ollama returned no tailored resume.");

      return {
        text,
        confidence: 0.52,
        sourceContext: this.createSourceContext(
          { contextUsed: "resume_job_description_user_context" },
          this.id,
          config.ollama.model
        ),
        provider: this.id,
        model: config.ollama.model,
      };
    } finally {
      this.clearTimeout(timeoutId);
    }
  }
}
