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
      full_name: "Ada Byron Lovelace",
      first_name: "Augusta Ada",
      middle_name: "Byron",
      last_name: "Lovelace",
      preferred_name: "Ada",
      email: "ada@lovelace.test",
      phone: "312-555-0101",
      location: "Chicago, IL",
      street_address: "123 Analytical Engine Way",
      city: "Chicago",
      state_region: "Illinois",
      postal_code: "60601",
      country: "USA",
      linkedin_url: "https://linkedin.com/in/ada",
      work_authorization: "Authorized to work in the United States.",
      sponsorship_required: false,
      date_of_birth: "1990-12-10",
      gender: "Non-binary",
      gender_identity: "Woman",
      pronouns: "she/her",
      race_ethnicity: "Prefer not to say",
      disability_status: "No, I do not have a disability",
      veteran_status: "I am not a protected veteran",
    });
  });

  it("uses precise structured name and address fields before legacy fallbacks", async () => {
    const result = await deterministicSuggestions("profile-1", [
      { fieldId: "preferred", label: "Preferred Name", type: "text" },
      { fieldId: "first", label: "First Name", type: "text" },
      { fieldId: "middle", label: "Middle Name", type: "text" },
      { fieldId: "last", label: "Family Name", type: "text" },
      { fieldId: "street", label: "Address Line 1", type: "text" },
      { fieldId: "city", label: "Current City", type: "text" },
      { fieldId: "state", label: "State / Province", type: "select", options: [
        { label: "Select", value: "" },
        { label: "Illinois", value: "IL" },
      ] },
      { fieldId: "zip", label: "Zipcode", type: "text" },
      { fieldId: "country", label: "Country of Residence", type: "select", options: [
        { label: "United States", value: "US" },
      ] },
    ]);

    expect(result.suggestions.map(({ fieldId, suggestedValue, sourceContext }) => ({
      fieldId,
      suggestedValue,
      column: sourceContext.column,
    }))).toEqual([
      { fieldId: "preferred", suggestedValue: "Ada", column: "preferred_name" },
      { fieldId: "first", suggestedValue: "Augusta Ada", column: "first_name" },
      { fieldId: "middle", suggestedValue: "Byron", column: "middle_name" },
      { fieldId: "last", suggestedValue: "Lovelace", column: "last_name" },
      { fieldId: "street", suggestedValue: "123 Analytical Engine Way", column: "street_address" },
      { fieldId: "city", suggestedValue: "Chicago", column: "city" },
      { fieldId: "state", suggestedValue: "IL", column: "state_region" },
      { fieldId: "zip", suggestedValue: "60601", column: "postal_code" },
      { fieldId: "country", suggestedValue: "US", column: "country" },
    ]);
  });

  it("maps authorization options and keeps demographic values in explicit protected fields", async () => {
    const result = await deterministicSuggestions("profile-1", [
      { fieldId: "authorization", label: "Are you legally authorized to work in the U.S.?", type: "radio", options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ] },
      { fieldId: "sponsorship", label: "Will you require visa sponsorship?", type: "radio", options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ] },
      { fieldId: "identity", label: "Gender Identity", type: "select", sensitivity: "sensitive" },
      { fieldId: "pronouns", label: "Preferred Pronouns", type: "select" },
    ]);

    expect(result.blockedFields).toEqual([]);
    expect(result.suggestions.map(({ fieldId, suggestedValue, requiresUserReview }) => ({
      fieldId,
      suggestedValue,
      requiresUserReview,
    }))).toEqual([
      { fieldId: "authorization", suggestedValue: "yes", requiresUserReview: true },
      { fieldId: "sponsorship", suggestedValue: "no", requiresUserReview: true },
      { fieldId: "identity", suggestedValue: "Woman", requiresUserReview: true },
      { fieldId: "pronouns", suggestedValue: "she/her", requiresUserReview: true },
    ]);
  });

  it("falls back to splitting full name only when structured name parts are missing", async () => {
    mocks.findProfile.mockResolvedValue({ full_name: "Grace Brewster Murray Hopper" });

    const result = await deterministicSuggestions("profile-1", [
      { fieldId: "first", label: "Given Name", type: "text" },
      { fieldId: "last", label: "Surname", type: "text" },
    ]);

    expect(result.suggestions.map(({ suggestedValue, sourceContext }) => ({ suggestedValue, sourceContext }))).toEqual([
      { suggestedValue: "Grace", sourceContext: { matched: "first name", column: "full_name" } },
      { suggestedValue: "Hopper", sourceContext: { matched: "last name", column: "full_name" } },
    ]);
  });

  it("does not treat unrelated fields containing name as the applicant's full name", async () => {
    const result = await deterministicSuggestions("profile-1", [
      { fieldId: "company", label: "Company Name", type: "text" },
      { fieldId: "school", label: "School Name", type: "text" },
    ]);

    expect(result.suggestions).toEqual([]);
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
