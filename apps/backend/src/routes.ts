import express from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./db/prisma";
import { config } from "./config";
import { listProviders, getProvider } from "./providers";
import { createSuggestions } from "./services/suggestionService";
import { syncProfileFromContext } from "./services/profileContextSync";
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
  const existing = await prisma.userProfile.findFirst({
    orderBy: { created_at: "asc" },
  });
  if (existing) return existing;

  return prisma.userProfile.create({ data: {} });
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

    const data = {
      ...(body.fullName != null ? { full_name: body.fullName } : {}),
      ...(body.email != null ? { email: body.email } : {}),
      ...(body.phone != null ? { phone: body.phone } : {}),
      ...(body.location != null ? { location: body.location } : {}),
      ...(body.linkedinUrl != null ? { linkedin_url: body.linkedinUrl } : {}),
      ...(body.githubUrl != null ? { github_url: body.githubUrl } : {}),
      ...(body.portfolioUrl != null ? { portfolio_url: body.portfolioUrl } : {}),
      ...(body.workAuthorization != null ? { work_authorization: body.workAuthorization } : {}),
      ...(body.sponsorshipRequired != null ? { sponsorship_required: body.sponsorshipRequired } : {}),
      updated_at: new Date(),
    };

    const updated = await prisma.userProfile.update({
      where: { id: profile.id },
      data,
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.get("/answer-bank", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const items = await prisma.answerBankItem.findMany({
      where: { user_profile_id: profile.id },
      orderBy: { updated_at: "desc" },
    });
    res.json(items);
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
    const item = await prisma.answerBankItem.create({
      data: {
        user_profile_id: profile.id,
        question_key: body.questionKey ?? null,
        question_text: body.questionText,
        answer_text: body.answerText,
        tags: body.tags,
      },
    });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.get("/context", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const context = await prisma.userContextDocument.findFirst({
      where: { user_profile_id: profile.id, is_active: true },
      orderBy: { updated_at: "desc" },
    });
    res.json(
      context ?? {
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

    await prisma.userContextDocument.updateMany({
      where: { user_profile_id: profile.id },
      data: { is_active: false, updated_at: new Date() },
    });

    const context = await prisma.userContextDocument.create({
      data: {
        user_profile_id: profile.id,
        title: body.title,
        content: body.content,
        tags: body.tags,
        source_type: "manual_text",
        is_active: true,
      },
    });
    await syncProfileFromContext(profile.id, body.content);
    res.json(context);
  } catch (error) {
    next(error);
  }
});

router.get("/resume-versions", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const resumes = await prisma.resumeVersion.findMany({
      where: { user_profile_id: profile.id },
      orderBy: { updated_at: "desc" },
    });
    res.json(resumes);
  } catch (error) {
    next(error);
  }
});

router.post("/resume-versions", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        label: z.string().default("Resume"),
        fileName: z.string().optional(),
        parsedText: z.string().max(150000),
        targetRole: z.string().optional(),
        metadata: z.record(z.unknown()).default({}),
      })
      .parse(req.body);

    const resume = await prisma.resumeVersion.create({
      data: {
        user_profile_id: profile.id,
        label: body.label,
        file_name: body.fileName ?? null,
        parsed_text: body.parsedText,
        target_role: body.targetRole ?? null,
        metadata: body.metadata as Prisma.InputJsonValue,
      },
    });
    res.status(201).json(resume);
  } catch (error) {
    next(error);
  }
});

router.post("/resume-versions/tailor", async (req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const body = z
      .object({
        resumeVersionId: z.string().optional(),
        resumeText: z.string().max(150000).optional(),
        jobDescription: z.string().max(100000),
        label: z.string().default("Tailored resume draft"),
        save: z.boolean().default(false),
      })
      .parse(req.body);

    let resumeText = body.resumeText;
    if (!resumeText && body.resumeVersionId) {
      const resume = await prisma.resumeVersion.findFirst({
        where: {
          id: body.resumeVersionId,
          user_profile_id: profile.id,
        },
        select: { parsed_text: true },
      });
      resumeText = resume?.parsed_text ?? undefined;
    }
    if (!resumeText) {
      throw new Error("Provide resumeText or resumeVersionId.");
    }

    const contextDocuments = await prisma.userContextDocument.findMany({
      where: { user_profile_id: profile.id, is_active: true },
      orderBy: { updated_at: "desc" },
      take: 3,
      select: { content: true },
    });
    const userContext = contextDocuments.map((row) => row.content).join("\n\n");
    const provider = getProvider();
    const fallbackProvider = getProvider(config.aiFallbackProvider);
    const activeProvider = provider
      .configured() && provider.id !== "none"
      ? provider
      : fallbackProvider;
    if (activeProvider.id === "none") {
      throw new Error("The active AI provider cannot tailor resumes.");
    }

    const draft = await activeProvider.tailorResume({
      resumeText,
      jobDescription: body.jobDescription,
      userContext,
    });

    let savedResume = null;
    if (body.save) {
      savedResume = await prisma.resumeVersion.create({
        data: {
          user_profile_id: profile.id,
          label: body.label,
          parsed_text: draft.text,
          target_role: null,
          metadata: {
            generated: true,
            provider: draft.provider,
            model: draft.model,
            sourceContext: draft.sourceContext,
          } as Prisma.InputJsonValue,
        },
      });
    }

    res.json({
      tailoredResume: draft.text,
      confidence: draft.confidence,
      provider: draft.provider,
      model: draft.model,
      sourceContext: draft.sourceContext,
      savedResume,
    });
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

    const existing = await prisma.applicationSession.findFirst({
      where: {
        user_profile_id: profile.id,
        status: "active",
        OR: [
          { canonical_job_url: canonical },
          ...(domain ? [{ ats_domain: domain }] : []),
        ],
      },
      orderBy: { last_seen_at: "desc" },
    });

    if (existing) {
      const updated = await prisma.applicationSession.update({
        where: { id: existing.id },
        data: {
          last_seen_at: new Date(),
          job_url: body.pageUrl,
          current_step: existing.current_step ?? body.pageTitle ?? null,
        },
      });
      res.json(updated);
      return;
    }

    const created = await prisma.applicationSession.create({
      data: {
        user_profile_id: profile.id,
        job_url: body.pageUrl,
        canonical_job_url: canonical,
        company: body.companyHint ?? null,
        role: body.roleHint ?? null,
        ats_domain: domain,
        current_step: body.pageTitle ?? null,
      },
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get("/application-sessions", async (_req, res, next) => {
  try {
    const profile = await getOrCreateDefaultProfile();
    const sessions = await prisma.applicationSession.findMany({
      where: { user_profile_id: profile.id },
      orderBy: { last_seen_at: "desc" },
    });
    res.json(sessions);
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
        visibleText: z.string().max(100000).optional(),
      })
      .parse(req.body);
    const snapshot = await prisma.applicationPageSnapshot.create({
      data: {
        application_session_id: req.params.id,
        page_url: body.pageUrl,
        page_title: body.pageTitle ?? null,
        step_label: body.stepLabel ?? null,
        field_snapshot: {
          fields: body.fields,
          visibleText: body.visibleText?.slice(0, 20000),
        },
        visible_text_hash: body.visibleTextHash ?? null,
      },
    });
    res.status(201).json(snapshot);
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
        visibleText: z.string().max(100000).optional(),
      })
      .parse(req.body);
    const result = await createSuggestions({
      applicationSessionId: req.params.id,
      pageSnapshotId: body.pageSnapshotId,
      userProfileId: profile.id,
      fields: body.fields,
      jobDescription: body.visibleText,
    });
    res.json(result);
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
      const log = await prisma.filledFieldLog.create({
        data: {
          application_session_id: req.params.id,
          page_snapshot_id: body.pageSnapshotId,
          field_suggestion_id: field.fieldSuggestionId ?? null,
          field_id: field.fieldId,
          field_label: field.fieldLabel ?? null,
          filled_value_redacted: redactValue(field.filledValue),
          value_hash: hashValue(field.filledValue),
          user_confirmed: true,
        },
      });
      inserted.push(log);
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
