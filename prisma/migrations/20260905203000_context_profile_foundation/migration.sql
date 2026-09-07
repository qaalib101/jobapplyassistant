ALTER TABLE "user_profiles"
  ADD COLUMN "first_name" TEXT,
  ADD COLUMN "middle_name" TEXT,
  ADD COLUMN "last_name" TEXT,
  ADD COLUMN "preferred_name" TEXT,
  ADD COLUMN "street_address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state_region" TEXT,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "gender_identity" TEXT,
  ADD COLUMN "pronouns" TEXT;

ALTER TABLE "field_suggestions"
  ADD COLUMN "context_revision_id" UUID;

CREATE INDEX "field_suggestions_context_revision_idx"
  ON "field_suggestions"("context_revision_id");

ALTER TABLE "field_suggestions"
  ADD CONSTRAINT "field_suggestions_context_revision_id_fkey"
  FOREIGN KEY ("context_revision_id") REFERENCES "user_context_documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
