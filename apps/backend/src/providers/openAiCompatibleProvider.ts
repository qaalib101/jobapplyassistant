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

interface OpenAiCompatibleOptions {
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "Draft concise job application answers from provided user context. Do not invent credentials. Return valid JSON only.",
            },
            {
              role: "user",
              content: [
                'Return exactly {"answers":[{"fieldId":"string","answer":"string","confidence":0.0,"sourceContext":{"contextUsed":"string","usedUploadedContext":true},"needsReview":true}]}',
                `Fields/questions: ${JSON.stringify(input.fields)}`,
                `Scanned job description/page text: ${input.jobDescription ?? "Not provided"}`,
                `User context: ${input.context}`,
              ].join("\n\n"),
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`${this.label} request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
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

  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    const batch = await this.generateAnswerDrafts({
      fields: [{ field: input.field, question: input.question }],
      context: input.context,
      jobDescription: input.jobDescription,
    });
    const first = batch[0];
    if (!first) throw new Error(`${this.label} did not return answer.`);
    return {
      text: first.text,
      confidence: first.confidence,
      sourceContext: first.sourceContext,
      provider: first.provider,
      model: first.model,
    };
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "Tailor a resume draft for a specific job description. Preserve truthful experience, do not invent credentials, keep concise resume formatting, and return only the revised resume text.",
            },
            {
              role: "user",
              content: [
                `Original resume:\n${input.resumeText}`,
                `Job description:\n${input.jobDescription}`,
                `Additional user context:\n${input.userContext}`,
              ].join("\n\n"),
            },
          ],
          temperature: 0.25,
        }),
      });

      if (!response.ok) {
        throw new Error(`${this.label} request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content?.trim();
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
