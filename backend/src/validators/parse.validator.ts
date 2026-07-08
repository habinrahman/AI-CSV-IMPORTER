import { z } from "zod";

/** Body contract for POST /api/parse (mirrors ParseRequestBody in @groweasy/shared). */
export const parseRequestSchema = z.object({
  fileId: z.string().uuid("fileId must be a UUID returned by /api/upload"),
  previewRows: z.coerce.number().int().min(1).max(100).default(20),
});

export type ParseRequest = z.infer<typeof parseRequestSchema>;
