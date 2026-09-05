import { z } from "zod";

export const fieldSensitivitySchema = z.enum(["normal", "sensitive", "manual-only"]);

export const fieldCategorySchema = z.enum([
  "contact",
  "personal",
  "work",
  "demographic",
  "eeo",
  "disability",
  "veteran",
  "gender",
  "race",
  "unknown",
]);

export const fieldSchema = z.object({
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
    "password",
    "date",
    "unknown",
  ]),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).nullable().optional(),
  domPathHash: z.string().optional(),
  visible: z.boolean().optional(),
  currentValue: z.string().optional(),
  checked: z.boolean().optional(),
  sensitivity: fieldSensitivitySchema.optional(),
  category: fieldCategorySchema.optional(),
});

export const filledFieldsRequestSchema = z.object({
  pageSnapshotId: z.string(),
  fields: z.array(
    z.object({
      fieldSuggestionId: z.string().optional(),
      fieldId: z.string(),
      fieldLabel: z.string().optional(),
      filled: z.boolean(),
      filledValue: z.string().optional(),
      skipped: z.string().max(200).optional(),
    }),
  ),
});
