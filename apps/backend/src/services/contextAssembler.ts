import { pool } from "../db/pool";
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
    pool.query("SELECT * FROM user_profiles WHERE id = $1", [userProfileId]),
    pool.query(
      "SELECT company, title, description, achievements, skills_used FROM work_experiences WHERE user_profile_id = $1 ORDER BY is_current DESC, end_date DESC NULLS FIRST",
      [userProfileId],
    ),
    pool.query(
      "SELECT name, description, technologies, highlights FROM project_experiences WHERE user_profile_id = $1",
      [userProfileId],
    ),
    pool.query(
      "SELECT name, category, proficiency, years_experience FROM skills WHERE user_profile_id = $1",
      [userProfileId],
    ),
    pool.query(
      "SELECT question_text, answer_text, tags FROM answer_bank_items WHERE user_profile_id = $1 ORDER BY usage_count DESC, updated_at DESC LIMIT 20",
      [userProfileId],
    ),
    pool.query(
      "SELECT label, target_role, parsed_text FROM resume_versions WHERE user_profile_id = $1 ORDER BY updated_at DESC LIMIT 3",
      [userProfileId],
    ),
    pool.query(
      "SELECT title, content, source_type, tags, updated_at FROM user_context_documents WHERE user_profile_id = $1 AND is_active = true ORDER BY updated_at DESC LIMIT 5",
      [userProfileId],
    ),
  ]);

  const uploadedContextChars = contextDocuments.rows.reduce(
    (total, row) => total + String(row.content ?? "").length,
    0,
  );

  const context = [
    "UPLOADED APPLICATION ASSISTANT CONTEXT",
    contextDocuments.rows
      .map((row) => [`Title: ${row.title}`, String(row.content ?? "").slice(0, 14000)].join("\n"))
      .join("\n\n---\n\n") || "None",
    "",
    "STRUCTURED PROFILE DATA",
    JSON.stringify({
      profile: profile.rows[0] ?? null,
      work: work.rows,
      projects: projects.rows,
      skills: skills.rows,
    }),
    "",
    "SAVED ANSWER BANK",
    JSON.stringify(answers.rows),
    "",
    "RESUME VERSIONS",
    JSON.stringify(
      resumes.rows.map((row) => ({
        ...row,
        parsed_text: row.parsed_text?.slice(0, 6000),
      })),
    ),
  ].join("\n");

  return {
    text: context.slice(0, config.aiMaxContextChars),
    summary: {
      profilePresent: Boolean(profile.rows[0]),
      answerCount: answers.rows.length,
      resumeCount: resumes.rows.length,
      uploadedContextCount: contextDocuments.rows.length,
      uploadedContextChars,
    },
  };
}
