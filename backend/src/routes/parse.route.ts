import { Router } from "express";
import type { ParseController } from "../controllers/parse.controller";
import { validateBody } from "../middleware/validate";
import { parseRequestSchema } from "../validators/parse.validator";

export function createParseRouter(controller: ParseController): Router {
  const router = Router();
  router.post("/", validateBody(parseRequestSchema), controller.handle);
  return router;
}
