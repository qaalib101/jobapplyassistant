import { config } from "../config";

export async function chatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  label: string;
  systemPrompt: string;
  userMessages: string | string[];
  responseFormat?: { type: string };
  extraBody?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<string> {
  const messages = [
    { role: "system", content: options.systemPrompt },
    { role: "user", content: Array.isArray(options.userMessages) ? options.userMessages.join("\n\n") : options.userMessages },
  ];
  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    response_format: options.responseFormat ?? { type: "json_object" },
    ...options.extraBody,
  };
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${options.label} request failed with ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${options.label} returned no draft text.`);
  return content;
}