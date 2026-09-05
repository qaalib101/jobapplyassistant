import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProfile: vi.fn(),
  findAnswers: vi.fn(),
}));

vi.mock("../db/prisma", () => ({
  prisma: {
    userProfile: { findUnique: mocks.findProfile },
    answerBankItem: { findMany: mocks.findAnswers },
  },
}));

import { deterministicSuggestions } from "./fieldMatcher";

describe("deterministic profile matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAnswers.mockResolvedValue([]);
    mocks.findProfile.mockResolvedValue({
      id: "profile-1",
      phone: "312-555-0101",
      location: "Chicago, IL",
      linkedin_url: "https://linkedin.com/in/ada",
      date_of_birth: "1990-12-10",
      gender: "Non-binary",
      race_ethnicity: "Prefer not to say",
      disability_status: "No, I do not have a disability",
      veteran_status: "I am not a protected veteran",
    });
  });

  it("suggests stored contact and protected answers without AI", async () => {
    const result = await deterministicSuggestions("profile-1", [
      { fieldId: "phone", label: "Phone", type: "tel", sensitivity: "normal" },
      { fieldId: "location", label: "Current Location", type: "text", sensitivity: "normal" },
      { fieldId: "linkedin", label: "LinkedIn Profile", type: "url", sensitivity: "normal" },
      { fieldId: "dob", label: "Date of birth", type: "date", sensitivity: "sensitive" },
      {
        fieldId: "gender",
        label: "Gender",
        type: "select",
        sensitivity: "sensitive",
        options: [
          { label: "Choose", value: "" },
          { label: "Non-binary", value: "nonbinary" },
        ],
      },
    ]);

    expect(result.blockedFields).toEqual([]);
    expect(result.suggestions.map(({ fieldId, suggestedValue }) => ({ fieldId, suggestedValue }))).toEqual([
      { fieldId: "phone", suggestedValue: "312-555-0101" },
      { fieldId: "location", suggestedValue: "Chicago, IL" },
      { fieldId: "linkedin", suggestedValue: "https://linkedin.com/in/ada" },
      { fieldId: "dob", suggestedValue: "1990-12-10" },
      { fieldId: "gender", suggestedValue: "nonbinary" },
    ]);
  });

  it("blocks missing protected answers and never substitutes a generic location for a city field", async () => {
    mocks.findProfile.mockResolvedValue({ id: "profile-1", location: "Chicago, IL" });

    const result = await deterministicSuggestions("profile-1", [
      { fieldId: "city", label: "City", type: "text", sensitivity: "normal" },
      { fieldId: "gender", label: "Gender", type: "select", sensitivity: "sensitive" },
      { fieldId: "ssn", label: "SSN", type: "text", sensitivity: "manual-only" },
    ]);

    expect(result.suggestions).toEqual([]);
    expect(result.blockedFields).toEqual([
      { fieldId: "gender", fieldLabel: "Gender", reason: "sensitive-unconfigured" },
      { fieldId: "ssn", fieldLabel: "SSN", reason: "manual-only" },
    ]);
  });
});
