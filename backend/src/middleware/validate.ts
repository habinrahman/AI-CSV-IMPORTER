import type { RequestHandler } from "express";
import type { z } from "zod";
import { ValidationError } from "../utils/errors";

/**
 * Zod-validates the request body and replaces it with the parsed (typed,
 * defaulted, coerced) result, so controllers never see raw input.
 */
export function validateBody<Schema extends z.ZodTypeAny>(schema: Schema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError("Invalid request body", result.error.flatten().fieldErrors));
      return;
    }
    req.body = result.data;
    next();
  };
}
