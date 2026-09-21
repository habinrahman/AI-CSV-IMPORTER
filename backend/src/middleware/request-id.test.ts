import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requestId } from "./request-id";

function apply(incoming?: string) {
  const echoed: Record<string, string> = {};
  const req = {
    header: (name: string) => (name.toLowerCase() === "x-request-id" ? incoming : undefined),
  } as unknown as Request;
  const res = {
    setHeader: (name: string, value: string) => {
      echoed[name] = value;
    },
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  requestId()(req, res, next);
  return { req, echoed, next };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("requestId", () => {
  it("accepts a caller-supplied id that is shaped like an id", () => {
    const { req, echoed, next } = apply("gw-trace_123");

    expect(req.id).toBe("gw-trace_123");
    expect(echoed["X-Request-Id"]).toBe("gw-trace_123");
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects header values that could pollute logs and issues a UUID instead", () => {
    const { req, echoed } = apply('evil\npassword=hunter2 "injected"');

    expect(req.id).toMatch(UUID);
    expect(echoed["X-Request-Id"]).toBe(req.id);
    expect(JSON.stringify(echoed)).not.toContain("hunter2");
    expect(JSON.stringify(echoed)).not.toContain("\n");
  });

  it("rejects ids longer than 64 characters", () => {
    const { req } = apply("a".repeat(65));
    expect(req.id).toMatch(UUID);
  });

  it("assigns a UUID when the header is absent", () => {
    const { req, echoed, next } = apply(undefined);
    expect(req.id).toMatch(UUID);
    expect(echoed["X-Request-Id"]).toBe(req.id);
    expect(next).toHaveBeenCalledOnce();
  });
});
