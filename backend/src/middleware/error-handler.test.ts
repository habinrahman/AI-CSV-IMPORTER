import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { describe, expect, it, vi } from "vitest";
import { env } from "../config/env";
import { AppError, ValidationError } from "../utils/errors";
import { errorHandler } from "./error-handler";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    id: "req-test",
    log: { error: vi.fn() },
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

const next = vi.fn() as unknown as NextFunction;

describe("errorHandler", () => {
  it("exposes AppError status, message, details, and request id", () => {
    const req = mockReq();
    const res = mockRes();
    const err = new ValidationError("Missing file", { field: "file" });

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        message: "Missing file",
        requestId: "req-test",
        details: { field: "file" },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("maps multer LIMIT_FILE_SIZE to 413 using the configured cap", () => {
    const req = mockReq();
    const res = mockRes();
    const err = new multer.MulterError("LIMIT_FILE_SIZE");

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({
      error: {
        message: `File exceeds the ${env.MAX_FILE_SIZE_MB} MB upload limit`,
        requestId: "req-test",
      },
    });
  });

  it("maps other multer errors to 400 without leaking internals as 500", () => {
    const req = mockReq();
    const res = mockRes();
    const err = new multer.MulterError("LIMIT_UNEXPECTED_FILE");

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { message: string } }).error.message).toMatch(
      /^Upload rejected:/,
    );
  });

  it("sanitizes unknown errors to a generic 500 and omits the stack", () => {
    const req = mockReq();
    const res = mockRes();
    const err = new Error("database password is hunter2");

    errorHandler(err, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: {
        message: "Internal Server Error",
        requestId: "req-test",
      },
    });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    expect(JSON.stringify(res.body)).not.toContain("stack");
  });

  it("still returns a body when the request has no correlation id", () => {
    const req = mockReq({ id: undefined });
    const res = mockRes();

    errorHandler(new AppError(409, "Conflict"), req, res, next);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: { message: "Conflict" } });
  });
});
