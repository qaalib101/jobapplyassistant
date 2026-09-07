import { Prisma } from "@prisma/client";
import {
  ContextParseFieldResult,
  ContextParseResult,
  ParsedProfileValue,
  StructuredProfileField,
} from "../types";

type ProfileSnapshot = Partial<Record<StructuredProfileField, ParsedProfileValue>>;
type ParsedCandidate = { value: ParsedProfileValue; sourceLabel: string };
type ParsedCandidates = Partial<Record<StructuredProfileField, ParsedCandidate>>;

export const structuredProfileFields: StructuredProfileField[] = [
  "full_name", "first_name", "middle_name", "last_name", "preferred_name",
  "email", "phone", "location", "street_address", "city", "state_region",
  "postal_code", "country", "linkedin_url", "github_url", "portfolio_url",
  "work_authorization", "sponsorship_required", "date_of_birth", "gender",
  "gender_identity", "pronouns", "race_ethnicity", "disability_status", "veteran_status",
];

const aliases: Partial<Record<StructuredProfileField, string[]>> = {
  full_name: ["full name", "legal name"],
  first_name: ["first name", "given name"],
  middle_name: ["middle name"],
  last_name: ["last name", "family name", "surname"],
  preferred_name: ["preferred name", "chosen name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone"],
  location: ["location", "current location", "place of residence"],
  street_address: ["street address", "address line 1", "home address"],
  city: ["city", "current city"],
  state_region: ["state", "state region", "state / region", "province", "region"],
  postal_code: ["postal code", "zip", "zip code", "zipcode"],
  country: ["country", "country of residence"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin profile"],
  github_url: ["github", "github url", "github profile"],
  portfolio_url: ["portfolio / website", "portfolio", "portfolio url", "personal website", "website"],
  work_authorization: ["work authorization", "employment authorization", "authorized to work"],
  sponsorship_required: [
    "requires sponsorship", "sponsorship required", "visa sponsorship",
    "visa sponsorship required", "require visa sponsorship",
  ],
  date_of_birth: ["date of birth", "dob", "birth date"],
  gender: ["gender", "sex"],
  gender_identity: ["gender identity"],
  pronouns: ["pronouns", "preferred pronouns"],
  race_ethnicity: ["race / ethnicity", "race and ethnicity", "race", "ethnicity", "ethnic origin"],
  disability_status: ["disability status", "disability"],
  veteran_status: ["veteran status", "veteran", "military status"],
};

function normalizedLabel(value: string) {
  return value
    .replace(/^\s*(?:#{1,6}|[-*+]\s+)/, "")
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanValue(value: string) {
  return value.replace(/^\s*[-*+]\s+/, "").replace(/[*_`]$/g, "").trim();
}

function labeledEntries(content: string) {
  const lines = content.split(/\r?\n/);
  const entries = new Map<string, { value: string; sourceLabel: string }>();

  for (let index = 0; index < lines.length; index += 1) {
    const cleanedLine = lines[index].replace(/^\s*(?:#{1,6}\s*)/, "").trim();
    const match = cleanedLine.match(/^(?:[-*+]\s*)?(.{1,60}?):\s*(.*)$/);
    if (!match) continue;

    const sourceLabel = match[1].replace(/[*_`]/g, "").trim();
    const label = normalizedLabel(sourceLabel);
    let value = cleanValue(match[2]);

    if (!value) {
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next].trim();
        if (!candidate) continue;
        if (
          /^#{1,6}\s/.test(candidate) ||
          (!/^https?:\/\//i.test(candidate) && /^(?:[-*+]\s*)?.{1,60}:\s*/.test(candidate))
        ) break;
        value = cleanValue(candidate);
        break;
      }
    }

    if (label && value && !entries.has(label)) entries.set(label, { value, sourceLabel });
  }
  return entries;
}

function isClearValue(value: string) {
  return /^(?:unknown|not set|clear|remove)$/i.test(value.trim().replace(/[.!]$/, ""));
}

function candidateFor(
  entries: Map<string, { value: string; sourceLabel: string }>,
  field: StructuredProfileField,
) {
  for (const label of aliases[field] ?? []) {
    const entry = entries.get(normalizedLabel(label));
    if (!entry) continue;
    return {
      value: isClearValue(entry.value) ? null : entry.value,
      sourceLabel: entry.sourceLabel,
    } satisfies ParsedCandidate;
  }
  return undefined;
}

function booleanSponsorship(candidate?: ParsedCandidate): ParsedCandidate | undefined {
  if (!candidate || candidate.value === null || typeof candidate.value === "boolean") return candidate;
  const value = candidate.value.toLowerCase();
  if (/\b(?:do(?:es)? not|don'?t|no|not currently|without)\b.*\b(?:require|need|sponsorship)\b/.test(value)) {
    return { ...candidate, value: false };
  }
  if (/^(?:no|false)$/i.test(value)) return { ...candidate, value: false };
  if (/^(?:yes|true)$/i.test(value) || /\b(?:require|need)\b.*\bsponsorship\b/.test(value)) {
    return { ...candidate, value: true };
  }
  return undefined;
}

function firstMatch(content: string, pattern: RegExp, sourceLabel: string): ParsedCandidate | undefined {
  const value = content.match(pattern)?.[0];
  return value ? { value, sourceLabel } : undefined;
}

function addDerivedNameParts(candidates: ParsedCandidates) {
  const fullName = candidates.full_name?.value;
  if (typeof fullName !== "string") return;
  const pieces = fullName.trim().split(/\s+/).filter(Boolean);
  if (!candidates.first_name && pieces[0]) {
    candidates.first_name = { value: pieces[0], sourceLabel: "Full Name" };
  }
  if (!candidates.last_name && pieces.length > 1) {
    candidates.last_name = { value: pieces[pieces.length - 1], sourceLabel: "Full Name" };
  }
}

function addDerivedFullName(candidates: ParsedCandidates) {
  if (candidates.full_name) return;
  const parts = [candidates.first_name?.value, candidates.middle_name?.value, candidates.last_name?.value]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  if (parts.length >= 2) candidates.full_name = { value: parts.join(" "), sourceLabel: "Name parts" };
}

function addLocationParts(candidates: ParsedCandidates) {
  const location = candidates.location?.value;
  if (typeof location === "string") {
    const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && !candidates.city) {
      candidates.city = { value: parts[0], sourceLabel: "Location" };
    }
    if (parts.length >= 2 && !candidates.state_region) {
      candidates.state_region = { value: parts[1], sourceLabel: "Location" };
    }
    if (parts.length >= 3 && !candidates.country) {
      candidates.country = { value: parts.slice(2).join(", "), sourceLabel: "Location" };
    }
  }

  if (!candidates.location) {
    const parts = [candidates.city?.value, candidates.state_region?.value, candidates.country?.value]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    if (parts.length >= 2) candidates.location = { value: parts.join(", "), sourceLabel: "Location parts" };
  }
}

export function parseProfileContext(
  content: string,
  currentProfile: ProfileSnapshot = {},
  contextRevisionId = "pending",
): ContextParseResult {
  const entries = labeledEntries(content);
  const candidates: ParsedCandidates = {};

  for (const field of structuredProfileFields) {
    const candidate = candidateFor(entries, field);
    if (candidate) candidates[field] = candidate;
  }

  candidates.email ??= firstMatch(content, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, "Detected email");
  candidates.phone ??= firstMatch(content, /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/, "Detected phone");
  candidates.sponsorship_required = booleanSponsorship(candidates.sponsorship_required);
  addDerivedNameParts(candidates);
  addDerivedFullName(candidates);
  addLocationParts(candidates);

  const fields: ContextParseFieldResult[] = [];
  const notFound: StructuredProfileField[] = [];
  for (const field of structuredProfileFields) {
    const candidate = candidates[field];
    if (!candidate) {
      notFound.push(field);
      continue;
    }
    const previousValue = currentProfile[field] ?? null;
    const status = candidate.value === null
      ? "cleared"
      : candidate.value === previousValue
        ? "unchanged"
        : "changed";
    fields.push({
      field,
      status,
      value: candidate.value,
      previousValue,
      sourceLabel: candidate.sourceLabel,
    });
  }

  return { contextRevisionId, fields, notFound };
}

type ProfileClient = Pick<Prisma.TransactionClient, "userProfile">;

export async function syncProfileFromContext(
  client: ProfileClient,
  userProfileId: string,
  content: string,
  contextRevisionId: string,
) {
  const profile = await client.userProfile.findUniqueOrThrow({ where: { id: userProfileId } });
  const currentProfile = Object.fromEntries(
    structuredProfileFields.map((field) => [field, profile[field] as ParsedProfileValue]),
  ) as ProfileSnapshot;
  const parsing = parseProfileContext(content, currentProfile, contextRevisionId);
  const data = Object.fromEntries(
    parsing.fields
      .filter((result) => result.status === "changed" || result.status === "cleared")
      .map((result) => [result.field, result.value ?? null]),
  ) as Prisma.UserProfileUpdateInput;

  if (Object.keys(data).length > 0) {
    await client.userProfile.update({
      where: { id: userProfileId },
      data: { ...data, updated_at: new Date() },
    });
  }
  return parsing;
}
