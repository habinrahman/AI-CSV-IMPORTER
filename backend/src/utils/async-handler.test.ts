import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { asyncHandler } from "./async-handler";

describe("asyncHandler", () => {
  it("forwards a rejected promise to next instead of leaving it unhandled", async () => {
    const boom = new Error("failed");
    const handler = asyncHandler(async () => {
      throw boom;
    });
    const next = vi.fn() as unknown as NextFunction;

    handler({} as Request, {} as Response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(boom));
  });

  it("does not call next when the handler resolves", async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.status?.(204);
    });
    const next = vi.fn() as unknown as NextFunction;
    const res = { status: vi.fn() } as unknown as Response;

    handler({} as Request, res, next);
    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(204));
    expect(next).not.toHaveBeenCalled();
  });
});
