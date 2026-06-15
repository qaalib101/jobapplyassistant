import { config } from "../config";
import { AIProvider, DraftAnswerInput, DraftAnswerResult } from "../types";

interface OpenAiCompatibleOptions {
  id: "deepseek" | "openai";
  label: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export class OpenAiCompatibleProvider implements AIProvider {
  id: "deepseek" | "openai";
  label: string;
  mode = "remote" as const;
  private baseUrl: string;
  private apiKey?: string;
  private model: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.id = options.id;
    this.label = options.label;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  configured() {
    return Boolean(this.apiKey);
  }

  async healthCheck() {
    return this.configured();
  }

  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    if (!this.apiKey) {
      throw new Error(`${this.label} API key is not configured.`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
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
                "Draft concise job application answers from provided user context. Do not invent credentials. Return only the answer text.",
            },
            {
              role: "user",
              content: [
                `Question: ${input.question}`,
                `Field metadata: ${JSON.stringify(input.field)}`,
                `User context: ${input.context}`,
              ].join("\n\n"),
            },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`${this.label} request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error(`${this.label} returned no draft text.`);

      return {
        text,
        confidence: 0.62,
        sourceContext: {
          contextUsed: "profile_resume_answer_bank",
          provider: this.id,
        },
        provider: this.id,
        model: this.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
