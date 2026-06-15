CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  work_authorization TEXT,
  sponsorship_required BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  achievements JSONB NOT NULL DEFAULT '[]',
  skills_used JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  repo_url TEXT,
  technologies JSONB NOT NULL DEFAULT '[]',
  highlights JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  proficiency TEXT,
  years_experience NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resume_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  file_name TEXT,
  file_path TEXT,
  parsed_text TEXT,
  target_role TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE answer_bank_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  question_key TEXT,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  source_type TEXT,
  source_ids JSONB NOT NULL DEFAULT '[]',
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE application_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  job_url TEXT NOT NULL,
  canonical_job_url TEXT NOT NULL,
  company TEXT,
  role TEXT,
  ats_domain TEXT,
  ats_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_step TEXT,
  completed_steps JSONB NOT NULL DEFAULT '[]',
  selected_resume_version_id UUID REFERENCES resume_versions(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE application_page_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_session_id UUID NOT NULL REFERENCES application_sessions(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_title TEXT,
  step_label TEXT,
  field_snapshot JSONB NOT NULL DEFAULT '{}',
  visible_text_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE field_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_session_id UUID NOT NULL REFERENCES application_sessions(id) ON DELETE CASCADE,
  page_snapshot_id UUID NOT NULL REFERENCES application_page_snapshots(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL,
  field_label TEXT,
  field_type TEXT,
  suggested_value TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT,
  source_ids JSONB NOT NULL DEFAULT '[]',
  source_context JSONB NOT NULL DEFAULT '{}',
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  is_generated BOOLEAN NOT NULL DEFAULT false,
  requires_user_review BOOLEAN NOT NULL DEFAULT true,
  accepted BOOLEAN,
  rejected BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE filled_field_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_session_id UUID NOT NULL REFERENCES application_sessions(id) ON DELETE CASCADE,
  page_snapshot_id UUID NOT NULL REFERENCES application_page_snapshots(id) ON DELETE CASCADE,
  field_suggestion_id UUID REFERENCES field_suggestions(id) ON DELETE SET NULL,
  field_id TEXT NOT NULL,
  field_label TEXT,
  filled_value TEXT,
  filled_value_redacted TEXT,
  value_hash TEXT,
  fill_method TEXT NOT NULL DEFAULT 'user_selected',
  user_confirmed BOOLEAN NOT NULL DEFAULT true,
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_session_id UUID REFERENCES application_sessions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  purpose TEXT NOT NULL,
  input_summary JSONB NOT NULL DEFAULT '{}',
  output_summary JSONB NOT NULL DEFAULT '{}',
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX application_sessions_user_status_idx ON application_sessions (user_profile_id, status);
CREATE INDEX application_sessions_domain_idx ON application_sessions (ats_domain);
CREATE INDEX application_sessions_canonical_url_idx ON application_sessions (canonical_job_url);
CREATE INDEX page_snapshots_session_idx ON application_page_snapshots (application_session_id, created_at DESC);
CREATE INDEX field_suggestions_snapshot_idx ON field_suggestions (page_snapshot_id);
CREATE INDEX answer_bank_question_key_idx ON answer_bank_items (question_key);
CREATE INDEX answer_bank_tags_gin_idx ON answer_bank_items USING GIN (tags);
