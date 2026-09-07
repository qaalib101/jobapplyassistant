import { describe, expect, it } from "vitest";
import { profileFieldLabels, summarizeParsing, type ContextParseResult } from "./contextParsing";

describe("context parsing presentation", () => {
  it("counts every parser result status", () => {
    const result: ContextParseResult = {
      contextRevisionId: "revision-2",
      fields: [
        { field: "city", status: "changed", value: "Saint Paul" },
        { field: "email", status: "unchanged", value: "ada@example.test" },
        { field: "preferred_name", status: "cleared", value: null },
        { field: "sponsorship_required", status: "needs_review", message: "Ambiguous" },
      ],
      notFound: ["middle_name"],
    };

    expect(summarizeParsing(result)).toEqual({ changed: 1, unchanged: 1, cleared: 1, needs_review: 1 });
  });

  it("provides readable labels for structured profile fields", () => {
    expect(profileFieldLabels.state_region).toBe("State / region");
    expect(profileFieldLabels.sponsorship_required).toBe("Sponsorship required");
    expect(profileFieldLabels.race_ethnicity).toBe("Race / ethnicity");
  });
});
