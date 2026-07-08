import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not catch rejected promises from async handlers — an
 * unwrapped async throw would crash the process instead of reaching the
 * central error handler. Every async controller method is wrapped in this.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
