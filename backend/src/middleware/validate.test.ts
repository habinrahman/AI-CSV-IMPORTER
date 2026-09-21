import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ValidationError } from "../utils/errors";
import { validateBody } from "./validate";

const schema = z.object({
  fileId: z.string().uuid(),
  previewRows: z.coerce.number().int().min(1).max(100).default(20),
});

function mockReq(body: unknown): Request {
  return { body } as Request;
}

describe("validateBody", () => {
  it("replaces req.body with the parsed, defaulted result and calls next", () => {
    const req = mockReq({ fileId: "11111111-1111-4111-8111-111111111111" });
    const next = vi.fn() as unknown as NextFunction;

    validateBody(schema)(req, {} as Response, next);

    expect(req.body).toEqual({
      fileId: "11111111-1111-4111-8111-111111111111",
      previewRows: 20,
    });
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it("forwards a ValidationError when the body fails the schema", () => {
    const req = mockReq({ fileId: "not-a-uuid" });
    const next = vi.fn() as unknown as NextFunction;

    validateBody(schema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ statusCode: 400, message: "Invalid request body" });
    expect(err.details).toHaveProperty("fileId");
  });
});
