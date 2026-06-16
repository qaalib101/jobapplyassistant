import { config } from "../config";
import { AIProvider, DraftAnswerInput, DraftAnswerResult } from "../types";

export class OllamaProvider implements AIProvider {
  id = "ollama";
  label = "Ollama";
  mode = "local" as const;

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

  async generateAnswerDraft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/generate`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: config.ollama.model,
          stream: false,
          prompt: [
            "Draft a concise job application answer from the provided user context.",
            "Do not invent credentials. Return only the answer text.",
            `Question: ${input.question}`,
            `Field metadata: ${JSON.stringify(input.field)}`,
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

      return {
        text,
        confidence: 0.55,
        sourceContext: {
          contextUsed: "profile_resume_answer_bank",
          provider: this.id,
        },
        provider: this.id,
        model: config.ollama.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async tailorResume(input: {
    resumeText: string;
    jobDescription: string;
    userContext: string;
  }): Promise<DraftAnswerResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
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
        sourceContext: {
          contextUsed: "resume_job_description_user_context",
          provider: this.id,
        },
        provider: this.id,
        model: config.ollama.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
