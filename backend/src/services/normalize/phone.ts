import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Deterministic E.164 canonicalization backed by libphonenumber metadata —
 * real dial-plan validation, not a digit-count regex. Handles international
 * prefixes ("00"), national trunk zeros, and separators natively.
 *
 * The model sometimes emits a bare country code without "+" (e.g.
 * "919876543210"); libphonenumber reads that as a (too long) national
 * number, so a "+"-prefixed candidate is tried as a fallback.
 */
export function normalizeMobile(value: string, defaultRegion: string): string | null {
  return parseValid(value, defaultRegion)?.number ?? null;
}

/** The CRM's split representation: calling code + national number. */
export interface MobileParts {
  /** "+91" form. */
  country_code: string;
  /** National number, digits only. */
  mobile_without_country_code: string;
}

export function normalizeMobileParts(value: string, defaultRegion: string): MobileParts | null {
  const parsed = parseValid(value, defaultRegion);
  if (!parsed) return null;
  return {
    country_code: `+${parsed.countryCallingCode}`,
    mobile_without_country_code: parsed.nationalNumber,
  };
}

function parseValid(value: string, defaultRegion: string) {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const region = defaultRegion as CountryCode;
  const candidates = [trimmed];

  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!trimmed.startsWith("+") && digits.length >= 11 && digits.length <= 15) {
    candidates.push(`+${digits}`);
  }

  for (const candidate of candidates) {
    const parsed = parsePhoneNumberFromString(candidate, region);
    if (parsed?.isValid()) {
      return parsed;
    }
  }
  return null;
}
