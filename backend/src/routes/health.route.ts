import { Router } from "express";
import type { HealthController } from "../controllers/health.controller";

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get("/", controller.handle);
  return router;
}
