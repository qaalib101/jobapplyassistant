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
  };
}

export async function assembleUserContext(userProfileId: string): Promise<AssembledUserContext> {
  const [profile, work, projects, skills, answers, resumes, contextDocuments] = await Promise.all([
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
    prisma.userContextDocument.findMany({
      where: { user_profile_id: userProfileId, is_active: true },
      select: { title: true, content: true, source_type: true, tags: true, updated_at: true },
      orderBy: { updated_at: "desc" },
      take: 5,
    }),
  ]);

  const uploadedContextChars = contextDocuments.reduce(
    (total: number, row: { content: string | null }) => total + String(row.content ?? "").length,
    0,
  );

  const context = [
    "UPLOADED APPLICATION ASSISTANT CONTEXT",
    contextDocuments
      .map((row: { title: string; content: string | null }) => [`Title: ${row.title}`, String(row.content ?? "").slice(0, 14000)].join("\n"))
      .join("\n\n---\n\n") || "None",
    "",
    "STRUCTURED PROFILE DATA",
    JSON.stringify({
      profile,
      work,
      projects,
      skills,
    }),
    "",
    "SAVED ANSWER BANK",
    JSON.stringify(answers),
    "",
    "RESUME VERSIONS",
    JSON.stringify(
      resumes.map((row: { label: string; target_role: string | null; parsed_text: string | null }) => ({
        ...row,
        parsed_text: row.parsed_text?.slice(0, 6000),
      })),
    ),
  ].join("\n");

  return {
    text: context.slice(0, config.aiMaxContextChars),
    summary: {
      profilePresent: Boolean(profile),
      answerCount: answers.length,
      resumeCount: resumes.length,
      uploadedContextCount: contextDocuments.length,
      uploadedContextChars,
    },
  };
}
