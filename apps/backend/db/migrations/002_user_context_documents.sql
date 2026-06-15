CREATE TABLE IF NOT EXISTS user_context_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'General AI context',
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual_text',
  tags JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_context_documents_profile_active_idx
ON user_context_documents (user_profile_id, is_active, updated_at DESC);
