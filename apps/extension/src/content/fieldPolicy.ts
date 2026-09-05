(() => {
  type FieldSensitivity = "normal" | "sensitive" | "manual-only";
  type FieldCategory =
    | "contact"
    | "personal"
    | "work"
    | "demographic"
    | "eeo"
    | "disability"
    | "veteran"
    | "gender"
    | "race"
    | "unknown";

  const manualOnlyTokens = [
    "ssn",
    "social security",
    "social security number",
    "password",
    "confirm password",
    "password confirmation",
  ];

  const sensitiveTokens = [
    "gender",
    "sex",
    "race",
    "ethnicity",
    "ethnic origin",
    "demographic",
    "eeo",
    "equal employment",
    "disability",
    "disabled",
    "veteran",
    "veteran status",
    "military status",
    "date of birth",
    "dob",
    "birth date",
    "birthday",
  ];

  const categoryRules: Array<{ tokens: string[]; category: FieldCategory }> = [
    { tokens: ["gender", "sex", "pronoun"], category: "gender" },
    { tokens: ["race", "ethnicity", "ethnic", "ethnic origin"], category: "race" },
    { tokens: ["disability", "disabled", "impairment", "handicap"], category: "disability" },
    { tokens: ["veteran", "military", "armed forces", "army", "navy", "air force", "marine"], category: "veteran" },
    { tokens: ["eeo", "equal employment", "equal opportunity"], category: "eeo" },
    { tokens: ["demographic"], category: "demographic" },
    { tokens: ["date of birth", "dob", "birth date", "birthday", "age"], category: "personal" },
    { tokens: ["ssn", "social security", "password", "marital", "married", "single", "divorced", "citizen", "citizenship", "nationality", "national"], category: "personal" },
    { tokens: ["company", "employer", "work", "job", "position", "title", "experience", "employment", "education", "school", "university", "college", "degree", "gpa", "major", "salary", "compensation", "pay", "wage", "income", "authorization", "authorized", "visa", "sponsorship"], category: "work" },
    { tokens: ["name", "first name", "last name", "full name", "given name", "family name", "email", "e-mail", "phone", "mobile", "telephone", "cell", "fax", "address", "street", "city", "state", "zip", "postal", "country", "location", "linkedin", "github", "portfolio", "website", "url", "profile"], category: "contact" },
  ];

  function normalize(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function classifySensitivity(
    label: string,
    name: string | undefined,
    id: string | undefined,
    type: string,
  ): FieldSensitivity {
    if (type === "password") return "manual-only";
    const text = normalize([label, name, id].filter(Boolean).join(" "));
    if (manualOnlyTokens.some((token) => text.includes(token))) return "manual-only";
    if (sensitiveTokens.some((token) => text.includes(token))) return "sensitive";
    return "normal";
  }

  function classifyCategory(
    label: string,
    name: string | undefined,
    id: string | undefined,
  ): FieldCategory {
    const text = normalize([label, name, id].filter(Boolean).join(" "));
    for (const rule of categoryRules) {
      if (rule.tokens.some((token) => text.includes(token))) return rule.category;
    }
    return "unknown";
  }

  const target = globalThis as typeof globalThis & {
    JobApplyAssistantFieldPolicy?: {
      classifySensitivity: typeof classifySensitivity;
      classifyCategory: typeof classifyCategory;
      normalize: typeof normalize;
    };
  };
  target.JobApplyAssistantFieldPolicy = { classifySensitivity, classifyCategory, normalize };
})();
