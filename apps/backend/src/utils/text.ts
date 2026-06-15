import crypto from "node:crypto";

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|gh_src|source|ref)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function hostname(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function redactValue(value: string, visibleChars = 2): string {
  if (!value) return "";
  if (value.length <= visibleChars) return "*".repeat(value.length);
  return `${value.slice(0, visibleChars)}${"*".repeat(Math.min(8, value.length - visibleChars))}`;
}
