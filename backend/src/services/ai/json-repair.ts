/**
 * Mechanical repair of almost-JSON model output. Handles the three failure
 * shapes that account for nearly all real-world malformed responses:
 *   1. markdown code fences around the JSON
 *   2. prose before/after the JSON body
 *   3. trailing commas before } or ]
 *
 * Deliberately conservative: it re-frames existing text, it never fabricates
 * tokens. Anything beyond these repairs stays a retryable model error —
 * guessing at broken structure would risk importing corrupted data silently.
 */
export function repairJsonText(raw: string): string | null {
  let text = raw.trim();

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1] !== undefined) {
    text = fenced[1].trim();
  }

  // Extract the outermost object — tolerates prose around the body.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  text = text.slice(start, end + 1);

  // Trailing commas: valid in JS, fatal in JSON.
  text = text.replace(/,\s*([}\]])/g, "$1");

  return text;
}

/** Parse strictly first; fall back to a repaired candidate. */
export function parseJsonLeniently(raw: string): { value: unknown; repaired: boolean } | null {
  try {
    return { value: JSON.parse(raw), repaired: false };
  } catch {
    const candidate = repairJsonText(raw);
    if (candidate === null) return null;
    try {
      return { value: JSON.parse(candidate), repaired: true };
    } catch {
      return null;
    }
  }
}
