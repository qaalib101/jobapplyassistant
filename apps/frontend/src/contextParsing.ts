export type StructuredProfileField =
  | "full_name" | "first_name" | "middle_name" | "last_name" | "preferred_name"
  | "email" | "phone" | "location" | "street_address" | "city" | "state_region"
  | "postal_code" | "country" | "linkedin_url" | "github_url" | "portfolio_url"
  | "work_authorization" | "sponsorship_required" | "date_of_birth" | "gender"
  | "gender_identity" | "pronouns" | "race_ethnicity" | "disability_status" | "veteran_status";

export interface ContextParseFieldResult {
  field: StructuredProfileField;
  status: "changed" | "unchanged" | "cleared" | "needs_review";
  value?: string | boolean | null;
  previousValue?: string | boolean | null;
  sourceLabel?: string;
  message?: string;
}

export interface ContextParseResult {
  contextRevisionId: string;
  fields: ContextParseFieldResult[];
  notFound: StructuredProfileField[];
}

export const profileFieldLabels: Record<StructuredProfileField, string> = {
  full_name: "Full name",
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  preferred_name: "Preferred name",
  email: "Email",
  phone: "Phone",
  location: "Location",
  street_address: "Street address",
  city: "City",
  state_region: "State / region",
  postal_code: "Postal code",
  country: "Country",
  linkedin_url: "LinkedIn",
  github_url: "GitHub",
  portfolio_url: "Portfolio",
  work_authorization: "Work authorization",
  sponsorship_required: "Sponsorship required",
  date_of_birth: "Date of birth",
  gender: "Gender",
  gender_identity: "Gender identity",
  pronouns: "Pronouns",
  race_ethnicity: "Race / ethnicity",
  disability_status: "Disability status",
  veteran_status: "Veteran status",
};

export function summarizeParsing(result: ContextParseResult) {
  return result.fields.reduce(
    (summary, field) => {
      summary[field.status] += 1;
      return summary;
    },
    { changed: 0, unchanged: 0, cleared: 0, needs_review: 0 },
  );
}
