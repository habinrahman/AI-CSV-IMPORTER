import { z } from "zod";

/** Body contract for POST /api/imports (mirrors StartImportRequestBody in @groweasy/shared). */
export const startImportSchema = z.object({
  fileId: z.string().uuid("fileId must be a UUID returned by /api/upload"),
});

export type StartImportRequest = z.infer<typeof startImportSchema>;
