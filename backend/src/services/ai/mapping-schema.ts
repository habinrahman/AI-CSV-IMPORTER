import { z } from "zod";
import { CrmLeadSchema, CrmStatusSchema, DataSourceSchema } from "@groweasy/shared";

/**
 * Two schemas, one contract:
 *
 * - The WIRE schema is handed to the provider's structured-outputs mechanism.
 *   It uses only the JSON-Schema keyword subset strict mode supports
 *   everywhere (no minimum/maximum, no refinements), so schema derivation
 *   can never 400 the request.
 * - The FULL schema re-validates the response at runtime with everything the
 *   wire format cannot express: numeric bounds and the lead/skipReason
 *   exclusivity invariant.
 */

const WireLeadSchema = z.object({
  created_at: z.string(),
  name: z.string(),
  email: z.string(),
  country_code: z.string(),
  mobile_without_country_code: z.string(),
  company: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  lead_owner: z.string(),
  crm_status: CrmStatusSchema.nullable(),
  crm_note: z.string(),
  data_source: DataSourceSchema.or(z.literal("")),
  possession_time: z.string(),
  description: z.string(),
});

const WireRowSchema = z.object({
  rowIndex: z.number().int(),
  lead: WireLeadSchema.nullable(),
  skipReason: z.string().nullable(),
  confidence: z.number(),
});

/** For structured-outputs derivation ONLY — never for validation. */
export const BatchMappingWireSchema = z.object({
  rows: z.array(WireRowSchema),
});

/** The contract every AI response must actually satisfy. */
export const MappedRowSchema = z
  .object({
    /** Must echo the input row's index — the join key back to the source. */
    rowIndex: z.number().int().nonnegative(),
    /** The mapped lead, or null when the row is skipped. */
    lead: CrmLeadSchema.nullable(),
    /** Required exactly when lead is null. */
    skipReason: z.string().nullable(),
    /** Model's certainty for this row, 0–1. */
    confidence: z.number().min(0).max(1),
  })
  .superRefine((row, ctx) => {
    if ((row.lead === null) === (row.skipReason === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of lead or skipReason must be set",
      });
    }
  });

export type MappedRow = z.infer<typeof MappedRowSchema>;

export const BatchMappingSchema = z.object({
  rows: z.array(MappedRowSchema),
});

export type BatchMapping = z.infer<typeof BatchMappingSchema>;
