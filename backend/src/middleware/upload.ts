import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import multer from "multer";
import { env } from "../config/env";
import { ValidationError } from "../utils/errors";
import { isAcceptableCsvUpload, UPLOAD_FIELD_NAME } from "../validators/upload.validator";

/**
 * Multer configured for exactly one CSV file, streamed to disk (never
 * buffered in memory — a 10 MB upload must not cost 10 MB of heap).
 * The generated UUID filename doubles as the public fileId; the client's
 * original filename is metadata only and never touches the filesystem.
 */
export function createCsvUploadMiddleware(uploadDir: string): RequestHandler {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.csv`),
  });

  return multer({
    storage,
    limits: {
      fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      if (isAcceptableCsvUpload(file)) {
        cb(null, true);
      } else {
        cb(new ValidationError("Only .csv files are accepted"));
      }
    },
  }).single(UPLOAD_FIELD_NAME);
}
