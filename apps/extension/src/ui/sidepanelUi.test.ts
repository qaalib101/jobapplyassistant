import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("side panel confirmation controls", () => {
  const html = readFileSync("public/ui/sidepanel.html", "utf8");

  it("keeps a single explicit confirmation action", () => {
    expect(html).toContain("Confirm");
    expect(html).not.toContain("fillAllButton");
    expect(html).not.toContain("Fill all reviewed");
  });
});
