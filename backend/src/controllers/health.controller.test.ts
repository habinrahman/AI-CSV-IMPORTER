import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns an ok payload with service identity and a timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T05:00:00.000Z"));
    vi.stubEnv("npm_package_version", "0.1.0");

    const controller = new HealthController();
    const res = { json: vi.fn() } as unknown as Response;

    controller.handle({} as Request, res);

    expect(res.json).toHaveBeenCalledWith({
      status: "ok",
      service: "groweasy-backend",
      version: "0.1.0",
      timestamp: "2026-09-21T05:00:00.000Z",
    });
  });

  it("falls back to 0.0.0 when the package version env is unset", () => {
    const previous = process.env.npm_package_version;
    delete process.env.npm_package_version;

    try {
      const controller = new HealthController();
      const res = { json: vi.fn() } as unknown as Response;

      controller.handle({} as Request, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "ok", version: "0.0.0" }),
      );
    } finally {
      if (previous === undefined) delete process.env.npm_package_version;
      else process.env.npm_package_version = previous;
    }
  });
});
