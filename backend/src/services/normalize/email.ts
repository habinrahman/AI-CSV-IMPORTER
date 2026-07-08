/**
 * Deterministic email canonicalization. The model outputs best-effort values;
 * this is the authority. A value that fails here is discarded (with a
 * warning), never "fixed" — repairing data is inventing data.
 */
const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Lowercased + trimmed address, or null when the shape is not an email. */
export function normalizeEmail(value: string): string | null {
  const cleaned = value.trim().toLowerCase();
  return EMAIL_SHAPE.test(cleaned) ? cleaned : null;
}
