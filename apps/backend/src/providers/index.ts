import { config } from "../config";
import { AIProvider } from "../types";
import { MockProvider } from "./mockProvider";
import { NoneProvider } from "./noneProvider";
import { OllamaProvider } from "./ollamaProvider";
import { OpenAiCompatibleProvider } from "./openAiCompatibleProvider";

const providers: Record<string, AIProvider> = {
  deepseek: new OpenAiCompatibleProvider({
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: config.deepseek.baseUrl,
    apiKey: config.deepseek.apiKey,
    model: config.deepseek.model,
  }),
  openai: new OpenAiCompatibleProvider({
    id: "openai",
    label: "OpenAI",
    baseUrl: config.openai.baseUrl,
    apiKey: config.openai.apiKey,
    model: config.openai.model,
  }),
  ollama: new OllamaProvider(),
  mock: new MockProvider(),
  none: new NoneProvider(),
};

export function listProviders() {
  return Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
    mode: provider.mode,
    configured: provider.configured(),
  }));
}

export function getProvider(id = config.aiProvider): AIProvider {
  return providers[id] ?? providers.mock;
}

export function getFallbackProvider(): AIProvider {
  return getProvider(config.aiFallbackProvider);
}
