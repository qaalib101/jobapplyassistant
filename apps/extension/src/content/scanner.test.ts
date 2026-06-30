import { describe, it, expect, beforeEach } from 'vitest';

// Since scanner.ts is an IIFE, we need to extract the functions for testing
// We'll create a test-friendly version by copying the classification logic

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

const MANUAL_ONLY_TOKENS = [
  "ssn",
  "social security",
  "social security number",
  "date of birth",
  "dob",
  "birth date",
  "birthday",
  "password",
  "confirm password",
  "password confirmation",
];

const SENSITIVE_TOKENS = [
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
];

const CATEGORY_RULES: Array<{ tokens: string[]; category: FieldCategory }> = [
  // More specific categories first to avoid false matches
  { tokens: ["gender", "sex", "pronoun"], category: "gender" },
  { tokens: ["race", "ethnicity", "ethnic", "ethnic origin"], category: "race" },
  { tokens: ["disability", "disabled", "impairment", "handicap"], category: "disability" },
  { tokens: ["veteran", "military", "armed forces", "army", "navy", "air force", "marine"], category: "veteran" },
  { tokens: ["eeo", "equal employment", "equal opportunity"], category: "eeo" },
  { tokens: ["demographic"], category: "demographic" },
  { tokens: ["date of birth", "dob", "birth date", "birthday", "age"], category: "personal" },
  { tokens: ["ssn", "social security"], category: "personal" },
  { tokens: ["password"], category: "personal" },
  { tokens: ["marital", "married", "single", "divorced"], category: "personal" },
  { tokens: ["citizen", "citizenship", "nationality", "national"], category: "personal" },
  { tokens: ["company", "employer", "work", "job", "position", "title", "experience", "employment"], category: "work" },
  { tokens: ["education", "school", "university", "college", "degree", "gpa", "major"], category: "work" },
  { tokens: ["salary", "compensation", "pay", "wage", "income"], category: "work" },
  { tokens: ["authorization", "authorized", "work authorization", "visa", "sponsorship"], category: "work" },
  // General contact category last
  { tokens: ["name", "first name", "last name", "full name", "given name", "family name"], category: "contact" },
  { tokens: ["email", "e-mail", "email address"], category: "contact" },
  { tokens: ["phone", "mobile", "telephone", "cell", "fax"], category: "contact" },
  { tokens: ["address", "street", "city", "state", "zip", "postal", "country", "location"], category: "contact" },
  { tokens: ["linkedin", "github", "portfolio", "website", "url", "profile"], category: "contact" },
];

function normalizeForClassification(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function classifySensitivity(
  label: string,
  name: string | undefined,
  id: string | undefined,
  type: string,
): FieldSensitivity {
  if (type === "password") return "manual-only";

  const searchText = normalizeForClassification([label, name, id].filter(Boolean).join(" "));

  for (const token of MANUAL_ONLY_TOKENS) {
    if (searchText.includes(token)) return "manual-only";
  }

  for (const token of SENSITIVE_TOKENS) {
    if (searchText.includes(token)) return "sensitive";
  }

  return "normal";
}

function classifyCategory(
  label: string,
  name: string | undefined,
  id: string | undefined,
): FieldCategory {
  const searchText = normalizeForClassification([label, name, id].filter(Boolean).join(" "));

  for (const rule of CATEGORY_RULES) {
    for (const token of rule.tokens) {
      if (searchText.includes(token)) return rule.category;
    }
  }

  return "unknown";
}

describe('classifySensitivity', () => {
  describe('manual-only fields', () => {
    it('should classify password type as manual-only', () => {
      expect(classifySensitivity('Password', 'password', 'password', 'password')).toBe('manual-only');
    });

    it('should classify SSN fields as manual-only', () => {
      expect(classifySensitivity('SSN', 'ssn', 'ssn', 'text')).toBe('manual-only');
      expect(classifySensitivity('Social Security Number', 'social_security', 'ssn', 'text')).toBe('manual-only');
    });

    it('should classify date of birth fields as manual-only', () => {
      expect(classifySensitivity('Date of Birth', 'dob', 'birth_date', 'text')).toBe('manual-only');
      expect(classifySensitivity('Birthday', 'birthday', 'birthday', 'date')).toBe('manual-only');
    });

    it('should classify confirm password as manual-only', () => {
      expect(classifySensitivity('Confirm Password', 'confirm_password', 'confirm_password', 'password')).toBe('manual-only');
    });
  });

  describe('sensitive fields', () => {
    it('should classify gender fields as sensitive', () => {
      expect(classifySensitivity('Gender', 'gender', 'gender', 'select')).toBe('sensitive');
      expect(classifySensitivity('Sex', 'sex', 'sex', 'radio')).toBe('sensitive');
    });

    it('should classify race/ethnicity fields as sensitive', () => {
      expect(classifySensitivity('Race', 'race', 'race', 'select')).toBe('sensitive');
      expect(classifySensitivity('Ethnicity', 'ethnicity', 'ethnicity', 'select')).toBe('sensitive');
      expect(classifySensitivity('Ethnic Origin', 'ethnic_origin', 'ethnic_origin', 'select')).toBe('sensitive');
    });

    it('should classify disability fields as sensitive', () => {
      expect(classifySensitivity('Disability Status', 'disability', 'disability', 'radio')).toBe('sensitive');
      expect(classifySensitivity('Disabled', 'disabled', 'disabled', 'checkbox')).toBe('sensitive');
    });

    it('should classify veteran fields as sensitive', () => {
      expect(classifySensitivity('Veteran Status', 'veteran', 'veteran', 'radio')).toBe('sensitive');
      expect(classifySensitivity('Military Status', 'military', 'military', 'radio')).toBe('sensitive');
    });

    it('should classify EEO fields as sensitive', () => {
      expect(classifySensitivity('EEO', 'eeo', 'eeo', 'radio')).toBe('sensitive');
      expect(classifySensitivity('Equal Employment Opportunity', 'eeo', 'eeo', 'radio')).toBe('sensitive');
    });

    it('should classify demographic fields as sensitive', () => {
      expect(classifySensitivity('Demographic Information', 'demographic', 'demographic', 'text')).toBe('sensitive');
    });
  });

  describe('normal fields', () => {
    it('should classify name fields as normal', () => {
      expect(classifySensitivity('First Name', 'first_name', 'first_name', 'text')).toBe('normal');
      expect(classifySensitivity('Last Name', 'last_name', 'last_name', 'text')).toBe('normal');
    });

    it('should classify email fields as normal', () => {
      expect(classifySensitivity('Email', 'email', 'email', 'email')).toBe('normal');
    });

    it('should classify phone fields as normal', () => {
      expect(classifySensitivity('Phone', 'phone', 'phone', 'tel')).toBe('normal');
    });

    it('should classify address fields as normal', () => {
      expect(classifySensitivity('Address', 'address', 'address', 'text')).toBe('normal');
    });

    it('should classify work history fields as normal', () => {
      expect(classifySensitivity('Company', 'company', 'company', 'text')).toBe('normal');
      expect(classifySensitivity('Job Title', 'job_title', 'job_title', 'text')).toBe('normal');
    });
  });
});

describe('classifyCategory', () => {
  describe('contact category', () => {
    it('should classify name fields as contact', () => {
      expect(classifyCategory('First Name', 'first_name', 'first_name')).toBe('contact');
      expect(classifyCategory('Last Name', 'last_name', 'last_name')).toBe('contact');
      expect(classifyCategory('Full Name', 'full_name', 'full_name')).toBe('contact');
    });

    it('should classify email fields as contact', () => {
      expect(classifyCategory('Email', 'email', 'email')).toBe('contact');
      expect(classifyCategory('Email Address', 'email_address', 'email_address')).toBe('contact');
    });

    it('should classify phone fields as contact', () => {
      expect(classifyCategory('Phone', 'phone', 'phone')).toBe('contact');
      expect(classifyCategory('Mobile', 'mobile', 'mobile')).toBe('contact');
    });

    it('should classify address fields as contact', () => {
      expect(classifyCategory('Address', 'address', 'address')).toBe('contact');
      expect(classifyCategory('City', 'city', 'city')).toBe('contact');
      expect(classifyCategory('State', 'state', 'state')).toBe('contact');
      expect(classifyCategory('Zip Code', 'zip', 'zip')).toBe('contact');
    });

    it('should classify social profile fields as contact', () => {
      expect(classifyCategory('LinkedIn', 'linkedin', 'linkedin')).toBe('contact');
      expect(classifyCategory('GitHub', 'github', 'github')).toBe('contact');
      expect(classifyCategory('Portfolio', 'portfolio', 'portfolio')).toBe('contact');
    });
  });

  describe('demographic categories', () => {
    it('should classify gender fields as gender', () => {
      expect(classifyCategory('Gender', 'gender', 'gender')).toBe('gender');
      expect(classifyCategory('Pronouns', 'pronouns', 'pronouns')).toBe('gender');
    });

    it('should classify race fields as race', () => {
      expect(classifyCategory('Race', 'race', 'race')).toBe('race');
      expect(classifyCategory('Ethnicity', 'ethnicity', 'ethnicity')).toBe('race');
    });

    it('should classify disability fields as disability', () => {
      expect(classifyCategory('Disability', 'disability', 'disability')).toBe('disability');
    });

    it('should classify veteran fields as veteran', () => {
      expect(classifyCategory('Veteran', 'veteran', 'veteran')).toBe('veteran');
      expect(classifyCategory('Military', 'military', 'military')).toBe('veteran');
    });

    it('should classify EEO fields as eeo', () => {
      expect(classifyCategory('EEO', 'eeo', 'eeo')).toBe('eeo');
    });

    it('should classify demographic fields as demographic', () => {
      expect(classifyCategory('Demographic', 'demographic', 'demographic')).toBe('demographic');
    });
  });

  describe('work category', () => {
    it('should classify employment fields as work', () => {
      expect(classifyCategory('Company', 'company', 'company')).toBe('work');
      expect(classifyCategory('Employer', 'employer', 'employer')).toBe('work');
      expect(classifyCategory('Job Title', 'job_title', 'job_title')).toBe('work');
      expect(classifyCategory('Position', 'position', 'position')).toBe('work');
    });

    it('should classify education fields as work', () => {
      expect(classifyCategory('Education', 'education', 'education')).toBe('work');
      expect(classifyCategory('University', 'university', 'university')).toBe('work');
      expect(classifyCategory('Degree', 'degree', 'degree')).toBe('work');
    });

    it('should classify salary fields as work', () => {
      expect(classifyCategory('Salary', 'salary', 'salary')).toBe('work');
      expect(classifyCategory('Compensation', 'compensation', 'compensation')).toBe('work');
    });

    it('should classify work authorization fields as work', () => {
      expect(classifyCategory('Work Authorization', 'work_authorization', 'work_authorization')).toBe('work');
      expect(classifyCategory('Visa Status', 'visa', 'visa')).toBe('work');
    });
  });

  describe('personal category', () => {
    it('should classify date of birth fields as personal', () => {
      expect(classifyCategory('Date of Birth', 'dob', 'dob')).toBe('personal');
      expect(classifyCategory('Birthday', 'birthday', 'birthday')).toBe('personal');
    });

    it('should classify SSN fields as personal', () => {
      expect(classifyCategory('SSN', 'ssn', 'ssn')).toBe('personal');
    });

    it('should classify marital status fields as personal', () => {
      expect(classifyCategory('Marital Status', 'marital_status', 'marital_status')).toBe('personal');
    });

    it('should classify citizenship fields as personal', () => {
      expect(classifyCategory('Citizenship', 'citizenship', 'citizenship')).toBe('personal');
    });
  });

  describe('unknown category', () => {
    it('should return unknown for unrecognized fields', () => {
      expect(classifyCategory('Random Field', 'random', 'random')).toBe('unknown');
      expect(classifyCategory('Custom Input', 'custom', 'custom')).toBe('unknown');
    });
  });
});

describe('normalizeForClassification', () => {
  it('should lowercase text', () => {
    expect(normalizeForClassification('FIRST NAME')).toBe('first name');
  });

  it('should replace non-alphanumeric characters with spaces', () => {
    expect(normalizeForClassification('first-name')).toBe('first name');
    expect(normalizeForClassification('first_name')).toBe('first name');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeForClassification('first   name')).toBe('first name');
  });

  it('should trim whitespace', () => {
    expect(normalizeForClassification('  first name  ')).toBe('first name');
  });
});