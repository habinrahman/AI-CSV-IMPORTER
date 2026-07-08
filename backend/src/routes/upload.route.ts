import { Router, type RequestHandler } from "express";
import type { UploadController } from "../controllers/upload.controller";

export function createUploadRouter(
  controller: UploadController,
  csvUpload: RequestHandler,
): Router {
  const router = Router();
  router.post("/", csvUpload, controller.handle);
  return router;
}
