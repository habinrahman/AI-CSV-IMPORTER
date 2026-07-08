import { Router } from "express";
import type { ImportsController } from "../controllers/imports.controller";
import { validateBody } from "../middleware/validate";
import { startImportSchema } from "../validators/imports.validator";

export function createImportsRouter(controller: ImportsController): Router {
  const router = Router();
  router.post("/", validateBody(startImportSchema), controller.start);
  router.get("/:id", controller.snapshot);
  router.delete("/:id", controller.cancel);
  router.get("/:id/events", controller.events);
  router.get("/:id/result", controller.result);
  return router;
}
