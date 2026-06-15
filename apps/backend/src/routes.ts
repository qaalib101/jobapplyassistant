import express from "express";
import { z } from "zod";
import { pool } from "./db/pool";
import { config } from "./config";
import { listProviders, getProvider } from "./providers";
import { createSuggestions } from "./services/suggestionService";
import { canonicalizeUrl, hashValue, hostname, redactValue } from "./utils/text";

const router = express.Router();

const fieldSchema = z.object({
  fieldId: z.string(),
  label: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "tel",
    "url",
    "number",
    "select",
    "radio",
    "checkbox",
    "file",
    "unknown",
  ]),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).nullable().optional(),
  domPathHash: z.string().optional(),
  visible: z.boolean().optional(),
});

async function getOrCreateDefaultProfile() {
  const existing = await pool.query("SELECT * FROM user_profiles ORDER BY created_at ASC LIMIT 1");
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    "INSERT INTO user_profiles DEFAULT VALUES RETURNING *",
  );
  return created.rows[0];
}

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/profile", async (_req, res, next) => {
  try {
    res.json(await getOrCreateDefaultProfile());
  } catch (error) {
    next(error);
  }
});

router.put("/profile", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        fullName: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        location: z.string().nullable().optional(),
        linkedinUrl: z.string().nullable().optional(),
        githubUrl: z.string().nullable().optional(),
        portfolioUrl: z.string().nullable().optional(),
        workAuthorization: z.string().nullable().optional(),
        sponsorshipRequired: z.boolean().nullable().optional(),
      })
      .parse(req.body);

    const updated = await pool.query(
      `
        UPDATE user_profiles
        SET full_name = COALESCE($2, full_name),
            email = COALESCE($3, email),
            phone = COALESCE($4, phone),
            location = COALESCE($5, location),
            linkedin_url = COALESCE($6, linkedin_url),
            github_url = COALESCE($7, github_url),
            portfolio_url = COALESCE($8, portfolio_url),
            work_authorization = COALESCE($9, work_authorization),
            sponsorship_required = COALESCE($10, sponsorship_required),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        profile.id,
        body.fullName,
        body.email,
        body.phone,
        body.location,
        body.linkedinUrl,
        body.githubUrl,
        body.portfolioUrl,
        body.workAuthorization,
        body.sponsorshipRequired,
      ],
    );
    res.json(updated.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get("/answer-bank", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const result = await pool.query(
      "SELECT * FROM answer_bank_items WHERE user_profile_id = $1 ORDER BY updated_at DESC",
      [profile.id],
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/answer-bank", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        questionKey: z.string().optional(),
        questionText: z.string(),
        answerText: z.string(),
        tags: z.array(z.string()).default([]),
      })
      .parse(req.body);
    const result = await pool.query(
      `
        INSERT INTO answer_bank_items (
          user_profile_id, question_key, question_text, answer_text, tags
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [profile.id, body.questionKey ?? null, body.questionText, body.answerText, JSON.stringify(body.tags)],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get("/context", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const result = await pool.query(
      `
        SELECT *
        FROM user_context_documents
        WHERE user_profile_id = $1 AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [profile.id],
    );
    res.json(
      result.rows[0] ?? {
        title: "General AI context",
        content: "",
        tags: [],
        source_type: "manual_text",
      },
    );
  } catch (error) {
    next(error);
  }
});

router.put("/context", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        title: z.string().default("General AI context"),
        content: z.string().max(100000),
        tags: z.array(z.string()).default([]),
      })
      .parse(req.body);

    await pool.query(
      "UPDATE user_context_documents SET is_active = false, updated_at = now() WHERE user_profile_id = $1",
      [profile.id],
    );

    const result = await pool.query(
      `
        INSERT INTO user_context_documents (
          user_profile_id, title, content, tags, source_type, is_active
        )
        VALUES ($1, $2, $3, $4, 'manual_text', true)
        RETURNING *
      `,
      [profile.id, body.title, body.content, JSON.stringify(body.tags)],
    );
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post("/application-sessions/resolve", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        pageUrl: z.string(),
        pageTitle: z.string().optional(),
        companyHint: z.string().optional(),
        roleHint: z.string().optional(),
      })
      .parse(req.body);
    const canonical = canonicalizeUrl(body.pageUrl);
    const domain = hostname(body.pageUrl);

    const existing = await pool.query(
      `
        SELECT * FROM application_sessions
        WHERE user_profile_id = $1
          AND status = 'active'
          AND (canonical_job_url = $2 OR ats_domain = $3)
        ORDER BY last_seen_at DESC
        LIMIT 1
      `,
      [profile.id, canonical, domain],
    );

    if (existing.rows[0]) {
      const updated = await pool.query(
        `
          UPDATE application_sessions
          SET last_seen_at = now(),
              job_url = $2,
              current_step = COALESCE(current_step, $3)
          WHERE id = $1
          RETURNING *
        `,
        [existing.rows[0].id, body.pageUrl, body.pageTitle ?? null],
      );
      res.json(updated.rows[0]);
      return;
    }

    const created = await pool.query(
      `
        INSERT INTO application_sessions (
          user_profile_id, job_url, canonical_job_url, company, role, ats_domain, current_step
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        profile.id,
        body.pageUrl,
        canonical,
        body.companyHint ?? null,
        body.roleHint ?? null,
        domain,
        body.pageTitle ?? null,
      ],
    );
    res.status(201).json(created.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.get("/application-sessions", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const result = await pool.query(
      "SELECT * FROM application_sessions WHERE user_profile_id = $1 ORDER BY last_seen_at DESC",
      [profile.id],
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post("/application-sessions/:id/page-snapshots", async (req, res, next) => {
  try {
    const body = z
      .object({
        pageUrl: z.string(),
        pageTitle: z.string().optional(),
        stepLabel: z.string().optional(),
        fields: z.array(fieldSchema),
        visibleTextHash: z.string().optional(),
      })
      .parse(req.body);
    const result = await pool.query(
      `
        INSERT INTO application_page_snapshots (
          application_session_id, page_url, page_title, step_label, field_snapshot, visible_text_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        req.params.id,
        body.pageUrl,
        body.pageTitle ?? null,
        body.stepLabel ?? null,
        JSON.stringify({ fields: body.fields }),
        body.visibleTextHash ?? null,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post("/application-sessions/:id/suggestions", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        pageSnapshotId: z.string(),
        fields: z.array(fieldSchema),
      })
      .parse(req.body);
    const suggestions = await createSuggestions({
      applicationSessionId: req.params.id,
      pageSnapshotId: body.pageSnapshotId,
      userProfileId: profile.id,
      fields: body.fields,
    });
    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
});

router.post("/application-sessions/:id/filled-fields", async (req, res, next) => {
  try {
    const body = z
      .object({
        pageSnapshotId: z.string(),
        fields: z.array(
          z.object({
            fieldSuggestionId: z.string().optional(),
            fieldId: z.string(),
            fieldLabel: z.string().optional(),
            filledValue: z.string(),
          }),
        ),
      })
      .parse(req.body);

    const inserted = [];
    for (const field of body.fields) {
      const result = await pool.query(
        `
          INSERT INTO filled_field_logs (
            application_session_id,
            page_snapshot_id,
            field_suggestion_id,
            field_id,
            field_label,
            filled_value_redacted,
            value_hash,
            user_confirmed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, true)
          RETURNING *
        `,
        [
          req.params.id,
          body.pageSnapshotId,
          field.fieldSuggestionId ?? null,
          field.fieldId,
          field.fieldLabel ?? null,
          redactValue(field.filledValue),
          hashValue(field.filledValue),
        ],
      );
      inserted.push(result.rows[0]);
    }
    res.status(201).json({ filledFields: inserted });
  } catch (error) {
    next(error);
  }
});

router.get("/ai/providers", (_req, res) => {
  res.json({
    activeProvider: config.aiProvider,
    fallbackProvider: config.aiFallbackProvider,
    availableProviders: listProviders(),
  });
});

router.post("/ai/providers/test", async (req, res, next) => {
  try {
    const body = z.object({ provider: z.string() }).parse(req.body);
    const provider = getProvider(body.provider);
    res.json({ provider: provider.id, ok: await provider.healthCheck() });
  } catch (error) {
    next(error);
  }
});

export { router };
