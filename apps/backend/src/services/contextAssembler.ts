import { prisma } from "../db/prisma";
import { config } from "../config";

export interface AssembledUserContext {
  text: string;
  summary: {
    profilePresent: boolean;
    answerCount: number;
    resumeCount: number;
    uploadedContextCount: number;
    uploadedContextChars: number;
    contextRevisionId: string | null;
  };
}

const protectedContextLabels = new Set([
  "date of birth",
  "dob",
  "birth date",
  "birthday",
  "age",
  "age bracket",
  "age range",
  "gender",
  "sex",
  "sexual orientation",
  "gender identity",
  "pronouns",
  "preferred pronouns",
  "race / ethnicity",
  "race and ethnicity",
  "race",
  "ethnicity",
  "ethnic origin",
  "disability status",
  "disability",
  "veteran status",
  "veteran",
  "military status",
]);

function normalizedContextLabel(value: string) {
  return value
    .replace(/^\s*(?:#{1,6}\s*|[-*+]\s*)/, "")
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function redactProtectedProfileLines(content: string) {
  const lines = content.split(/\r?\n/);
  const redacted: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*((?:#{1,6}\s*|[-*+]\s*)?[^:]{1,60}):\s*(.*)$/);
    const label = match?.[1] ? normalizedContextLabel(match[1]) : "";
    if (!match || !label || !protectedContextLabels.has(label)) {
      redacted.push(lines[index]);
      continue;
    }

    const displayLabel = match[1]
      .replace(/^\s*(?:#{1,6}\s*|[-*+]\s*)/, "")
      .replace(/[*_`]/g, "")
      .trim();
    redacted.push(`${displayLabel}: [stored as protected profile data]`);
    if (!match[2]?.trim() && index + 1 < lines.length) index += 1;
  }
  return redacted.join("\n");
}

function assembleWithinLimit(sections: Array<{ title: string; content: string; weight: number }>) {
  const render = (section: { title: string; content: string }) => `${section.title}\n${section.content || "None"}`;
  const complete = sections.map(render).join("\n\n");
  if (complete.length <= config.aiMaxContextChars) return complete;

  const headingChars = sections.reduce((total, section) => total + section.title.length + 2, 0);
  const contentBudget = Math.max(0, config.aiMaxContextChars - headingChars);
  return sections
    .map((section) => render({
      ...section,
      content: section.content.slice(0, Math.floor(contentBudget * section.weight)),
    }))
    .join("\n\n")
    .slice(0, config.aiMaxContextChars);
}

export async function assembleUserContext(userProfileId: string): Promise<AssembledUserContext> {
  const [profile, work, projects, skills, answers, resumes, contextDocument] = await Promise.all([
    prisma.userProfile.findUnique({ where: { id: userProfileId } }),
    prisma.workExperience.findMany({
      where: { user_profile_id: userProfileId },
      select: { company: true, title: true, description: true, achievements: true, skills_used: true },
      orderBy: [{ is_current: "desc" }, { end_date: { sort: "desc", nulls: "first" } }],
    }),
    prisma.projectExperience.findMany({
      where: { user_profile_id: userProfileId },
      select: { name: true, description: true, technologies: true, highlights: true },
    }),
    prisma.skill.findMany({
      where: { user_profile_id: userProfileId },
      select: { name: true, category: true, proficiency: true, years_experience: true },
    }),
    prisma.answerBankItem.findMany({
      where: { user_profile_id: userProfileId },
      select: { question_text: true, answer_text: true, tags: true },
      orderBy: [{ usage_count: "desc" }, { updated_at: "desc" }],
      take: 20,
    }),
    prisma.resumeVersion.findMany({
      where: { user_profile_id: userProfileId },
      select: { label: true, target_role: true, parsed_text: true },
      orderBy: { updated_at: "desc" },
      take: 3,
    }),
    prisma.userContextDocument.findFirst({
      where: { user_profile_id: userProfileId, is_active: true },
      select: { id: true, title: true, content: true, source_type: true, tags: true, updated_at: true },
      orderBy: { updated_at: "desc" },
    }),
  ]);

  const uploadedContextChars = String(contextDocument?.content ?? "").length;

  // Protected profile answers are used only for deterministic form matching.
  // Do not include them automatically in requests for unrelated AI-generated answers.
  const {
    date_of_birth: _dateOfBirth,
    street_address: _streetAddress,
    gender: _gender,
    gender_identity: _genderIdentity,
    pronouns: _pronouns,
    race_ethnicity: _raceEthnicity,
    disability_status: _disabilityStatus,
    veteran_status: _veteranStatus,
    ...aiSafeProfile
  } = profile ?? {};

  const context = assembleWithinLimit([
    {
      title: "UPLOADED APPLICATION ASSISTANT CONTEXT",
      content: contextDocument
        ? `Title: ${contextDocument.title}\n${redactProtectedProfileLines(String(contextDocument.content ?? ""))}`
        : "None",
      weight: 0.35,
    },
    {
      title: "STRUCTURED PROFILE DATA",
      content: JSON.stringify({ profile: aiSafeProfile, work, projects, skills }),
      weight: 0.3,
    },
    { title: "SAVED ANSWER BANK", content: JSON.stringify(answers), weight: 0.15 },
    {
      title: "RESUME VERSIONS",
      content: JSON.stringify(
        resumes.map((row: { label: string; target_role: string | null; parsed_text: string | null }) => ({
          ...row,
          parsed_text: row.parsed_text?.slice(0, 6000),
        })),
      ),
      weight: 0.2,
    },
  ]);

  return {
    text: context,
    summary: {
      profilePresent: Boolean(profile),
      answerCount: answers.length,
      resumeCount: resumes.length,
      uploadedContextCount: contextDocument ? 1 : 0,
      uploadedContextChars,
      contextRevisionId: contextDocument?.id ?? null,
    },
  };
}
