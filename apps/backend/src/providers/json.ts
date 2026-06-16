export function extractJsonObject<T = unknown>(text: string): T {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as T;

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI provider did not return JSON.");

  return JSON.parse(match[0]) as T;
}
