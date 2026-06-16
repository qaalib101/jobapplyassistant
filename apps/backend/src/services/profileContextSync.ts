import { prisma } from "../db/prisma";

function labeledValue(content: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = content.match(new RegExp(`^${escaped}:\\s*\\n?([^\\n]+)`, "im"));
    const value = match?.[1]?.trim();
    if (value && !/^unknown$/i.test(value)) return value;
  }
  return undefined;
}

function firstEmail(content: string) {
  return content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function firstPhone(content: string) {
  return content.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)?.[0];
}

function yesNoValue(content: string, labels: string[]) {
  const value = labeledValue(content, labels);
  if (!value) return undefined;
  if (/^yes\b/i.test(value)) return true;
  if (/^no\b/i.test(value)) return false;
  return undefined;
}

export async function syncProfileFromContext(userProfileId: string, content: string) {
  const city = labeledValue(content, ["City"]);
  const state = labeledValue(content, ["State"]);
  const country = labeledValue(content, ["Country"]);
  const location = [city, state, country].filter(Boolean).join(", ") || undefined;

  await prisma.userProfile.update({
    where: { id: userProfileId },
    data: {
      full_name: labeledValue(content, ["Full Name"]),
      email: labeledValue(content, ["Email"]) ?? firstEmail(content),
      phone: labeledValue(content, ["Phone"]) ?? firstPhone(content),
      location,
      linkedin_url: labeledValue(content, ["LinkedIn"]),
      github_url: labeledValue(content, ["GitHub"]),
      portfolio_url: labeledValue(content, ["Portfolio / Website", "Portfolio", "Website"]),
      work_authorization: labeledValue(content, ["Work Authorization"]),
      sponsorship_required: yesNoValue(content, ["Requires Sponsorship"]),
      updated_at: new Date(),
    },
  });
}
