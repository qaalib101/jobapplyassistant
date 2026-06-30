-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "linkedin_url" TEXT,
    "github_url" TEXT,
    "portfolio_url" TEXT,
    "work_authorization" TEXT,
    "sponsorship_required" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_experiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "achievements" JSONB NOT NULL DEFAULT '[]',
    "skills_used" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_experiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "repo_url" TEXT,
    "technologies" JSONB NOT NULL DEFAULT '[]',
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "proficiency" TEXT,
    "years_experience" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "file_name" TEXT,
    "file_path" TEXT,
    "parsed_text" TEXT,
    "target_role" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_bank_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "question_key" TEXT,
    "question_text" TEXT NOT NULL,
    "answer_text" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "source_type" TEXT,
    "source_ids" JSONB NOT NULL DEFAULT '[]',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "job_url" TEXT NOT NULL,
    "canonical_job_url" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "ats_domain" TEXT,
    "ats_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_step" TEXT,
    "completed_steps" JSONB NOT NULL DEFAULT '[]',
    "selected_resume_version_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "application_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_page_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_session_id" UUID NOT NULL,
    "page_url" TEXT NOT NULL,
    "page_title" TEXT,
    "step_label" TEXT,
    "field_snapshot" JSONB NOT NULL DEFAULT '{}',
    "visible_text_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_page_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_session_id" UUID NOT NULL,
    "page_snapshot_id" UUID NOT NULL,
    "field_id" TEXT NOT NULL,
    "field_label" TEXT,
    "field_type" TEXT,
    "suggested_value" TEXT,
    "confidence" DECIMAL NOT NULL DEFAULT 0,
    "source_type" TEXT,
    "source_ids" JSONB NOT NULL DEFAULT '[]',
    "source_context" JSONB NOT NULL DEFAULT '{}',
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" TEXT,
    "is_generated" BOOLEAN NOT NULL DEFAULT false,
    "requires_user_review" BOOLEAN NOT NULL DEFAULT true,
    "accepted" BOOLEAN,
    "rejected" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filled_field_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_session_id" UUID NOT NULL,
    "page_snapshot_id" UUID NOT NULL,
    "field_suggestion_id" UUID,
    "field_id" TEXT NOT NULL,
    "field_label" TEXT,
    "filled_value" TEXT,
    "filled_value_redacted" TEXT,
    "value_hash" TEXT,
    "fill_method" TEXT NOT NULL DEFAULT 'user_selected',
    "user_confirmed" BOOLEAN NOT NULL DEFAULT true,
    "filled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filled_field_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_request_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_session_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "purpose" TEXT NOT NULL,
    "input_summary" JSONB NOT NULL DEFAULT '{}',
    "output_summary" JSONB NOT NULL DEFAULT '{}',
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_context_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'General AI context',
    "content" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'manual_text',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_context_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_sessions_user_status_idx" ON "application_sessions"("user_profile_id", "status");

-- CreateIndex
CREATE INDEX "application_sessions_domain_idx" ON "application_sessions"("ats_domain");

-- CreateIndex
CREATE INDEX "application_sessions_canonical_url_idx" ON "application_sessions"("canonical_job_url");

-- CreateIndex
CREATE INDEX "page_snapshots_session_idx" ON "application_page_snapshots"("application_session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "field_suggestions_snapshot_idx" ON "field_suggestions"("page_snapshot_id");

-- CreateIndex
CREATE INDEX "user_context_documents_profile_active_idx" ON "user_context_documents"("user_profile_id", "is_active", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_experiences" ADD CONSTRAINT "project_experiences_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_versions" ADD CONSTRAINT "resume_versions_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_bank_items" ADD CONSTRAINT "answer_bank_items_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_sessions" ADD CONSTRAINT "application_sessions_selected_resume_version_id_fkey" FOREIGN KEY ("selected_resume_version_id") REFERENCES "resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_sessions" ADD CONSTRAINT "application_sessions_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_page_snapshots" ADD CONSTRAINT "application_page_snapshots_application_session_id_fkey" FOREIGN KEY ("application_session_id") REFERENCES "application_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_suggestions" ADD CONSTRAINT "field_suggestions_application_session_id_fkey" FOREIGN KEY ("application_session_id") REFERENCES "application_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_suggestions" ADD CONSTRAINT "field_suggestions_page_snapshot_id_fkey" FOREIGN KEY ("page_snapshot_id") REFERENCES "application_page_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filled_field_logs" ADD CONSTRAINT "filled_field_logs_application_session_id_fkey" FOREIGN KEY ("application_session_id") REFERENCES "application_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filled_field_logs" ADD CONSTRAINT "filled_field_logs_field_suggestion_id_fkey" FOREIGN KEY ("field_suggestion_id") REFERENCES "field_suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filled_field_logs" ADD CONSTRAINT "filled_field_logs_page_snapshot_id_fkey" FOREIGN KEY ("page_snapshot_id") REFERENCES "application_page_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_context_documents" ADD CONSTRAINT "user_context_documents_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

