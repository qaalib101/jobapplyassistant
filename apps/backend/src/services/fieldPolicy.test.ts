import { describe, expect, it } from "vitest";
import { effectiveSensitivity, inferredSensitivity } from "./fieldPolicy";

describe("field policy", () => {
  it("keeps ordinary application fields fillable", () => {
    expect(inferredSensitivity({ fieldId: "email", label: "Email", type: "email" })).toBe("normal");
  });

  it("treats date of birth as protected but explicitly confirmable", () => {
    expect(inferredSensitivity({ fieldId: "dob", label: "Date of birth", type: "text" })).toBe("sensitive");
  });

  it("treats age brackets as protected without misclassifying ordinary text", () => {
    expect(inferredSensitivity({ fieldId: "age", label: "Age Bracket", type: "select" })).toBe("sensitive");
    expect(inferredSensitivity({ fieldId: "manager", label: "Management experience", type: "text" })).toBe("normal");
  });

  it("does not allow client metadata to weaken inferred protection", () => {
    expect(
      effectiveSensitivity({
        fieldId: "ssn",
        label: "Social security number",
        type: "text",
        sensitivity: "normal",
      }),
    ).toBe("manual-only");
  });

  it("preserves stricter client classification for ambiguous labels", () => {
    expect(
      effectiveSensitivity({
        fieldId: "custom-eeo",
        label: "Optional response",
        type: "select",
        sensitivity: "sensitive",
      }),
    ).toBe("sensitive");
  });
});
