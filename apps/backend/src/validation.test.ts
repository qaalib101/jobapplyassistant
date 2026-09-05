import { describe, expect, it } from "vitest";
import { fieldSchema, filledFieldsRequestSchema } from "./validation";

describe("field request validation", () => {
  it("preserves scanner safety and current-value metadata", () => {
    const parsed = fieldSchema.parse({
      fieldId: "field-1",
      label: "Password",
      type: "password",
      sensitivity: "manual-only",
      category: "personal",
      currentValue: "already entered",
      checked: false,
    });

    expect(parsed).toMatchObject({
      type: "password",
      sensitivity: "manual-only",
      category: "personal",
      currentValue: "already entered",
      checked: false,
    });
  });

  it("rejects unknown sensitivity values", () => {
    expect(() =>
      fieldSchema.parse({ fieldId: "field-1", type: "text", sensitivity: "public" }),
    ).toThrow();
  });
});

describe("fill-attempt validation", () => {
  it("accepts successful and failed per-field results", () => {
    const parsed = filledFieldsRequestSchema.parse({
      pageSnapshotId: "snapshot-1",
      fields: [
        { fieldId: "name", filled: true, filledValue: "Ada Lovelace" },
        { fieldId: "custom", filled: false, skipped: "element-not-found" },
      ],
    });

    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[1]).toMatchObject({ filled: false, skipped: "element-not-found" });
  });
});
