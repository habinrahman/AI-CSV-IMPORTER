import type { Request, Response } from "express";
import type { HealthResponse } from "@groweasy/shared";

export class HealthController {
  // Arrow property so the method can be passed as a bare handler reference.
  handle = (_req: Request, res: Response): void => {
    const body: HealthResponse = {
      status: "ok",
      service: "groweasy-backend",
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  };
}
