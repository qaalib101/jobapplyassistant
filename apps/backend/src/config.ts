import dotenv from "dotenv";
import path from "node:path";

// When running inside Docker, SKIP_DOTENV=true is set so that the Docker
// environment block (with correct service hostnames like "postgres:5432")
// takes precedence over the .env file (which uses "localhost:5432").
if (process.env.SKIP_DOTENV === "true") {
  console.log("[config] SKIP_DOTENV=true — skipping .env file loading (running in Docker)");
} else {
  // Commands run from the repository root in both source and compiled modes.
  // Using cwd avoids resolving to dist/.env after TypeScript compilation.
  const envPath = path.resolve(process.cwd(), ".env");

  // Use override: true to ensure .env values take precedence over global env vars
  const envResult = dotenv.config({ path: envPath, override: true });

  // Debug: log the path being used (helps diagnose dotenv issues)
  if (envResult.error) {
    console.warn(
      `[config] Warning: Could not load .env from ${envPath}:`,
      envResult.error.message,
    );
    console.warn(`[config] Falling back to CWD-based .env loading`);
    // Fallback: try loading from CWD (useful in some deployment scenarios)
    dotenv.config({ override: true });
  } else {
    console.log(`[config] Loaded .env from: ${envPath}`);
  }
}

export const config = {
  port: Number(process.env.PORT ?? 4317),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://jobapply:jobapply_dev@localhost:5433/jobapplyassistant",
  extensionOrigin: process.env.EXTENSION_ORIGIN,
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ?? "http://jobapply.localhost:8080",
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
