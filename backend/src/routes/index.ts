import { Router } from "express";
import type { Container } from "../container";
import { createHealthRouter } from "./health.route";
import { createImportsRouter } from "./imports.route";
import { createParseRouter } from "./parse.route";
import { createUploadRouter } from "./upload.route";

export function createApiRouter(container: Container): Router {
  const api = Router();

  // Health is intentionally NOT rate limited — platform health checks must
  // always get through.
  api.use("/health", createHealthRouter(container.healthController));

  api.use(container.rateLimiter);
  api.use("/upload", createUploadRouter(container.uploadController, container.csvUpload));
  api.use("/parse", createParseRouter(container.parseController));
  api.use("/imports", createImportsRouter(container.importsController));

  return api;
}
