/**
 * Cheap, deterministic contact-signal detection used by the pipeline's
 * pre-filter (a row with no email-like and no phone-like token anywhere can
 * never satisfy the "email or mobile" rule, so it can skip the AI entirely).
 *
 * Deliberately biased toward FALSE POSITIVES: keeping a contact-free row
 * costs a few tokens; wrongly skipping a real lead loses data. E.g. a date
 * like 2026-07-08 counts as phone-like (8 digits) — that is fine, the row
 * just proceeds to the AI, which is the safe direction.
 */

const EMAIL_TOKEN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Digit count of a plausible subscriber number (E.164 caps at 15). */
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

export function containsEmailLike(value: string): boolean {
  return EMAIL_TOKEN.test(value);
}

export function containsPhoneLike(value: string): boolean {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

/** True when any cell in the record could plausibly be an email or a phone. */
export function hasContactSignal(record: Record<string, string>): boolean {
  for (const value of Object.values(record)) {
    if (value !== "" && (containsEmailLike(value) || containsPhoneLike(value))) {
      return true;
    }
  }
  return false;
}
