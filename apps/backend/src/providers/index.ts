import { config } from "../config";
import { AIProvider } from "../types";
import { DeepSeekProvider } from "./deepSeekProvider";
import { MockProvider } from "./mockProvider";
import { NoneProvider } from "./noneProvider";
import { OllamaProvider } from "./ollamaProvider";
import { OpenAiCompatibleProvider } from "./openAiCompatibleProvider";
import { UnavailableProvider } from "./unavailableProvider";

const providers: Record<string, AIProvider> = {
  deepseek: config.deepseek.apiKey
    ? new DeepSeekProvider()
    : new UnavailableProvider(
        "deepseek",
        "DEEPSEEK_API_KEY is missing. Set it or use AI_PROVIDER=mock.",
      ),
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
