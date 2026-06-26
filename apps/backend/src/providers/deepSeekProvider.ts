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

interface DeepSeekPayload {
  answer?: string;
  answers?: Array<{
    fieldId?: string;
    answer?: string;
    confidence?: number;
    sourceContext?: Record<string, unknown>;
    usedContext?: string[];
    needsReview?: boolean;
    reasoningSummary?: string;
  }>;
  tailoredResume?: string;
  confidence?: number;
  sourceContext?: Record<string, unknown>;
}

function deepSeekStatusMessage(status: number) {
  if (status === 400) return "DeepSeek rejected the request format. Check model and JSON mode settings.";
  if (status === 401) return "DeepSeek authentication failed. Check DEEPSEEK_API_KEY.";
  if (status === 402) return "DeepSeek account has insufficient balance.";
  if (status === 422) return "DeepSeek rejected one or more request parameters. Check the configured model.";
  if (status === 429) return "DeepSeek rate limit reached.";
  if (status === 500) return "DeepSeek server error.";
  if (status === 503) return "DeepSeek server is overloaded.";
  return `DeepSeek request failed with ${status}.`;
}

async function providerMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message || payload.message;
  } catch {
    return undefined;
  }
}

export class DeepSeekProvider implements AIProvider {
  id = "deepseek";
  label = "DeepSeek";
  mode = "remote" as const;
  private baseUrl = config.deepseek.baseUrl.replace(/\/$/, "");
  private model = config.deepseek.model;
  private apiKey = config.deepseek.apiKey;

  configured() {
    return Boolean(this.apiKey);
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async jsonCompletion(prompt: string): Promise<DeepSeekPayload> {
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is missing. Set it or use AI_PROVIDER=mock.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: "Return valid JSON only. Do not include markdown." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          max_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const message = await providerMessage(response);
        throw new Error(`${deepSeekStatusMessage(response.status)}${message ? ` ${message}` : ""}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
      };
      const finishReason = payload.choices?.[0]?.finish_reason;
      if (finishReason === "length") {
        throw new Error("DeepSeek response was truncated. Try shorter input or increase max_tokens.");
      }
      if (finishReason === "content_filter") {
        throw new Error("DeepSeek content filter blocked the application draft.");
      }
      if (finishReason === "insufficient_system_resource") {
        throw new Error("DeepSeek did not have enough inference capacity. Try again later or switch AI_PROVIDER=mock.");
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned no content.");
      return extractJsonObject<DeepSeekPayload>(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    const batch = await this.generateAnswerDrafts({
      fields: [{ field: input.field, question: input.question }],
      context: input.context,
      jobDescription: input.jobDescription,
    });
    const first = batch[0];
    if (!first) throw new Error("DeepSeek did not return answer.");
    return {
      text: first.text,
      confidence: first.confidence,
      sourceContext: first.sourceContext,
      provider: first.provider,
      model: first.model,
    };
  }

  async generateAnswerDrafts(input: BatchAnswerInput): Promise<BatchAnswerResult[]> {
    const payload = await this.jsonCompletion([
      "Create truthful draft answers for multiple job application fields in one response.",
      "Return JSON only with this exact shape:",
      '{"answers":[{"fieldId":"string","answer":"string","confidence":0.0,"sourceContext":{"contextUsed":"string","usedUploadedContext":true},"needsReview":true,"reasoningSummary":"string"}]}',
      "Rules:",
      "- Return one answer object for each input fieldId.",
      "- Do not invent employers, dates, credentials, degrees, metrics, links, legal status, or salary facts.",
      "- If context is insufficient, write a conservative answer and lower confidence.",
      "- Use first person.",
      "- Keep each answer concise unless the field clearly asks for detail.",
      "- The model must not output any fields outside the JSON shape.",
      "- Use the job description to make answers relevant to this specific role.",
      "- Prefer concrete details from uploaded context and resume over generic enthusiasm.",
      "- Set needsReview=true for every answer.",
      `Fields/questions: ${JSON.stringify(input.fields)}`,
      `Scanned job description/page text: ${input.jobDescription ?? "Not provided"}`,
      `User identity/profile/resume/answer-bank/uploaded context: ${input.context}`,
    ].join("\n\n"));

    const validFieldIds = new Set(input.fields.map(({ field }) => field.fieldId));
    const answers = payload.answers ?? [];
    return answers
      .filter((answer) => answer.fieldId && validFieldIds.has(answer.fieldId) && answer.answer)
      .map((answer) => ({
        fieldId: answer.fieldId!,
        text: answer.answer!,
        confidence: Math.max(0, Math.min(1, answer.confidence ?? 0.64)),
        sourceContext: {
          ...(answer.sourceContext ?? {}),
          usedContext: answer.usedContext,
          needsReview: answer.needsReview ?? true,
          reasoningSummary: answer.reasoningSummary,
          contextUsed:
            answer.sourceContext?.contextUsed ?? "batch_profile_resume_answer_bank_uploaded_context_job_description",
          provider: this.id,
        },
        provider: this.id,
        model: this.model,
      }));
  }

  async tailorResume(input: {
    resumeText: string;
    jobDescription: string;
    userContext: string;
  }): Promise<DraftAnswerResult> {
    const payload = await this.jsonCompletion([
      "Tailor a resume draft for a specific job description.",
      "Return JSON only with this exact shape:",
      '{"tailoredResume":"string","confidence":0.0,"sourceContext":{"contextUsed":"string","usedUploadedContext":true}}',
      "Rules:",
      "- Preserve truthful experience only.",
      "- Do not invent employers, dates, credentials, degrees, metrics, or links.",
      "- Align wording and ordering to the job description.",
      "- Keep concise resume formatting.",
      "- The model must not output any fields outside the JSON shape.",
      `Original resume: ${input.resumeText}`,
      `Job description: ${input.jobDescription}`,
      `Uploaded user context: ${input.userContext}`,
    ].join("\n\n"));

    if (!payload.tailoredResume) throw new Error("DeepSeek did not return tailoredResume.");
    return {
      text: payload.tailoredResume,
      confidence: payload.confidence ?? 0.62,
      sourceContext: {
        ...(payload.sourceContext ?? {}),
        contextUsed: payload.sourceContext?.contextUsed ?? "resume_job_description_uploaded_context",
        provider: this.id,
      },
      provider: this.id,
      model: this.model,
    };
  }
}
