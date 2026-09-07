import { describe, expect, it, vi } from "vitest";
import { parseProfileContext, syncProfileFromContext } from "./profileContextSync";

function valuesByField(result: ReturnType<typeof parseProfileContext>) {
  return Object.fromEntries(result.fields.map((field) => [field.field, field.value]));
}

describe("free-form profile context parsing", () => {
  it("parses the representative candidate context including next-line values and aliases", () => {
    const result = parseProfileContext(
      `# Candidate Profile
Full Name: Qaalib Farah
Location:
Minneapolis, Minnesota, USA
Email: qaalib@example.com
Phone: (612) 249-2266
LinkedIn URL: https://linkedin.com/in/qaalib
GitHub:
https://github.com/qaalib101
Work Authorization:
Authorized to work in the United States.
Visa Sponsorship:
Does not currently require sponsorship.`,
      {},
      "revision-1",
    );

    expect(valuesByField(result)).toEqual(expect.objectContaining({
      full_name: "Qaalib Farah",
      first_name: "Qaalib",
      last_name: "Farah",
      location: "Minneapolis, Minnesota, USA",
      city: "Minneapolis",
      state_region: "Minnesota",
      country: "USA",
      email: "qaalib@example.com",
      phone: "(612) 249-2266",
      linkedin_url: "https://linkedin.com/in/qaalib",
      github_url: "https://github.com/qaalib101",
      work_authorization: "Authorized to work in the United States.",
      sponsorship_required: false,
    }));
    expect(result.contextRevisionId).toBe("revision-1");
    expect(result.notFound).toContain("preferred_name");
    expect(result.notFound).toContain("middle_name");
    expect(result.notFound).toContain("street_address");
    expect(result.notFound).toContain("postal_code");
  });

  it("does not invent middle or preferred names while safely deriving first and last name", () => {
    const result = parseProfileContext("Full Name: Ada Lovelace");
    const values = valuesByField(result);

    expect(values.first_name).toBe("Ada");
    expect(values.last_name).toBe("Lovelace");
    expect(values).not.toHaveProperty("middle_name");
    expect(values).not.toHaveProperty("preferred_name");
  });

  it("supports explicit clearing without treating EEO decline answers as empty", () => {
    const result = parseProfileContext(
      "Preferred Name: Not set\nPronouns: Unknown\nRace / Ethnicity: Prefer not to say",
      { preferred_name: "Ada", pronouns: "they/them" },
    );

    expect(result.fields).toContainEqual(expect.objectContaining({
      field: "preferred_name",
      status: "cleared",
      value: null,
      previousValue: "Ada",
    }));
    expect(result.fields).toContainEqual(expect.objectContaining({
      field: "pronouns",
      status: "cleared",
      value: null,
    }));
    expect(result.fields).toContainEqual(expect.objectContaining({
      field: "race_ethnicity",
      status: "changed",
      value: "Prefer not to say",
    }));
  });

  it("marks repeated values unchanged and leaves omitted fields out of updates", async () => {
    const update = vi.fn().mockResolvedValue({});
    const client = {
      userProfile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "profile-1",
          full_name: "Ada Lovelace",
          first_name: "Ada",
          last_name: "Lovelace",
          email: "existing@example.com",
          phone: null,
        }),
        update,
      },
    };

    const result = await syncProfileFromContext(
      client as never,
      "profile-1",
      "Full Name: Ada Lovelace\nPhone: 312-555-0101",
      "revision-2",
    );

    expect(result.fields).toContainEqual(expect.objectContaining({ field: "full_name", status: "unchanged" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: "312-555-0101" }),
    }));
    expect(update.mock.calls[0][0].data).not.toHaveProperty("email");
  });

  it("reports an unrecognized sponsorship answer as not found instead of guessing", () => {
    const result = parseProfileContext("Visa Sponsorship: Maybe in the future");
    expect(result.notFound).toContain("sponsorship_required");
    expect(result.fields).not.toContainEqual(expect.objectContaining({ field: "sponsorship_required" }));
  });
});
