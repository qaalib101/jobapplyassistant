import { BatchAnswerInput, BatchAnswerResult, DraftAnswerResult } from "../types";
import { extractJsonObject } from "./json";
import { BaseProvider } from "./baseProvider";
import { chatCompletion } from "./httpClient";

export interface OpenAiCompatibleOptions {
  id: "deepseek" | "openai";
  label: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export class OpenAiCompatibleProvider extends BaseProvider {
  id: "deepseek" | "openai";
  label: string;
  mode = "remote" as const;
  private baseUrl: string;
  private apiKey?: string;
  private model: string;

  constructor(options: OpenAiCompatibleOptions) {
    super(options.id, options.label, "remote");
    this.id = options.id;
    this.label = options.label;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  configured() {
    return Boolean(this.apiKey);
  }

  async generateAnswerDrafts(input: BatchAnswerInput): Promise<BatchAnswerResult[]> {
    if (!this.apiKey) {
      throw new Error(`${this.label} API key is not configured.`);
    }

    const { controller, timeoutId } = this.createTimeoutController();
    try {
      const content = await chatCompletion({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        model: this.model,
        label: this.label,
        systemPrompt: "Draft concise job application answers from provided user context. Do not invent credentials. Return valid JSON only.",
        userMessages: [
          'Return exactly {"answers":[{"fieldId":"string","answer":"string","confidence":0.0,"sourceContext":{"contextUsed":"string","usedUploadedContext":true},"needsReview":true}]}',
          `Fields/questions: ${JSON.stringify(input.fields)}`,
          `Scanned job description/page text: ${input.jobDescription ?? "Not provided"}`,
          `User context: ${input.context}`,
        ],
        responseFormat: { type: "json_object" },
        extraBody: { temperature: 0.3 },
        signal: controller.signal,
      });

      if (!content) throw new Error(`${this.label} returned no draft text.`);

      const parsed = extractJsonObject<{
        answers?: Array<{
          fieldId?: string;
          answer?: string;
          confidence?: number;
          sourceContext?: Record<string, unknown>;
          needsReview?: boolean;
        }>;
      }>(content);
      const validFieldIds = new Set(input.fields.map(({ field }) => field.fieldId));
      return (parsed.answers ?? [])
        .filter((answer) => answer.fieldId && validFieldIds.has(answer.fieldId) && answer.answer)
        .map((answer) => ({
          fieldId: answer.fieldId!,
          text: answer.answer!,
          confidence: Math.max(0, Math.min(1, answer.confidence ?? 0.62)),
          sourceContext: this.createSourceContext(
            {
              contextUsed:
                (answer.sourceContext as Record<string, unknown>)?.contextUsed as string ??
                "batch_profile_resume_answer_bank_uploaded_context_job_description",
              needsReview: answer.needsReview ?? true,
            },
            this.id,
            this.model
          ),
          provider: this.id,
          model: this.model,
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
    if (!this.apiKey) {
      throw new Error(`${this.label} API key is not configured.`);
    }

    const { controller, timeoutId } = this.createTimeoutController();
    try {
      const text = await chatCompletion({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        model: this.model,
        label: this.label,
        systemPrompt: "Tailor a resume draft for a specific job description. Preserve truthful experience, do not invent credentials, keep concise resume formatting, and return only the revised resume text.",
        userMessages: [
          `Original resume:\n${input.resumeText}`,
          `Job description:\n${input.jobDescription}`,
          `Additional user context:\n${input.userContext}`,
        ],
        extraBody: { temperature: 0.25 },
        signal: controller.signal,
      });

      if (!text) throw new Error(`${this.label} returned no tailored resume.`);
      return {
        text,
        confidence: 0.6,
        sourceContext: this.createSourceContext(
          { contextUsed: "resume_job_description_user_context" },
          this.id,
          this.model
        ),
        provider: this.id,
        model: this.model,
      };
    } finally {
      this.clearTimeout(timeoutId);
    }
  }
}