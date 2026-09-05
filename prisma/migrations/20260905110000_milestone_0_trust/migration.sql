ALTER TABLE "filled_field_logs"
ADD COLUMN "fill_succeeded" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "failure_reason" TEXT;

CREATE TABLE "suggestion_decision_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_session_id" UUID NOT NULL,
    "page_snapshot_id" UUID NOT NULL,
    "field_suggestion_id" UUID,
    "field_id" TEXT NOT NULL,
    "review_status" TEXT NOT NULL,
    "original_value_hash" TEXT,
    "edited_value_hash" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "confidence" DECIMAL,
    "source_type" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_decision_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suggestion_decisions_session_idx"
ON "suggestion_decision_logs"("application_session_id");

CREATE INDEX "suggestion_decisions_snapshot_idx"
ON "suggestion_decision_logs"("page_snapshot_id");

CREATE INDEX "ai_request_logs_session_idx"
ON "ai_request_logs"("application_session_id");

ALTER TABLE "suggestion_decision_logs"
ADD CONSTRAINT "suggestion_decision_logs_application_session_id_fkey"
FOREIGN KEY ("application_session_id") REFERENCES "application_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suggestion_decision_logs"
ADD CONSTRAINT "suggestion_decision_logs_page_snapshot_id_fkey"
FOREIGN KEY ("page_snapshot_id") REFERENCES "application_page_snapshots"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suggestion_decision_logs"
ADD CONSTRAINT "suggestion_decision_logs_field_suggestion_id_fkey"
FOREIGN KEY ("field_suggestion_id") REFERENCES "field_suggestions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_request_logs"
ADD CONSTRAINT "ai_request_logs_application_session_id_fkey"
FOREIGN KEY ("application_session_id") REFERENCES "application_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
