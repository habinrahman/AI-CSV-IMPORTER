import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { notFoundHandler } from "./not-found";

describe("notFoundHandler", () => {
  it("returns a 404 with the method and path that were not matched", () => {
    const req = { method: "POST", originalUrl: "/api/unknown" } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: "Route not found: POST /api/unknown" },
    });
  });
});
