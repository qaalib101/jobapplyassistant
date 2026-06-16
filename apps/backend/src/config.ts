import dotenv from "dotenv";

dotenv.config({ override: true });

export const config = {
  port: Number(process.env.PORT ?? 4317),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://jobapply:jobapply_dev@localhost:5433/jobapplyassistant",
  extensionOrigin: process.env.EXTENSION_ORIGIN,
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://jobapply.localhost:8080",
  aiProvider: process.env.AI_PROVIDER ?? "deepseek",
  aiFallbackProvider: process.env.AI_FALLBACK_PROVIDER ?? "mock",
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 20000),
  aiMaxContextChars: Number(process.env.AI_MAX_CONTEXT_CHARS ?? 30000),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "llama3.1",
  },
};
