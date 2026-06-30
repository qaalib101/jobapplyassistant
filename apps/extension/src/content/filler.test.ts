import { describe, it, expect } from 'vitest';

// Test the sensitivity classification logic used by filler to skip manual-only fields

type FieldSensitivity = "normal" | "sensitive" | "manual-only";

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

  return "normal";
}

describe('filler sensitivity classification', () => {
  describe('manual-only fields should be skipped', () => {
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

  describe('normal fields should not be skipped', () => {
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

  describe('sensitive fields should not be skipped by filler', () => {
    // Note: sensitive fields are not skipped by the filler, they are just marked
    // as requiring user review in the scanner. The filler only skips manual-only fields.
    it('should classify gender fields as normal (not manual-only)', () => {
      // The filler only checks for manual-only, not sensitive
      expect(classifySensitivity('Gender', 'gender', 'gender', 'select')).not.toBe('manual-only');
    });

    it('should classify race fields as normal (not manual-only)', () => {
      expect(classifySensitivity('Race', 'race', 'race', 'select')).not.toBe('manual-only');
    });

    it('should classify disability fields as normal (not manual-only)', () => {
      expect(classifySensitivity('Disability', 'disability', 'disability', 'radio')).not.toBe('manual-only');
    });

    it('should classify veteran fields as normal (not manual-only)', () => {
      expect(classifySensitivity('Veteran', 'veteran', 'veteran', 'radio')).not.toBe('manual-only');
    });
  });
});