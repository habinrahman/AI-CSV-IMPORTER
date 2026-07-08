import path from "node:path";
import type { Request, Response } from "express";
import type { UploadResponse } from "@groweasy/shared";
import type { FileStorage } from "../services/files/file-storage.service";
import { ValidationError } from "../utils/errors";

export class UploadController {
  constructor(private readonly files: FileStorage) {}

  handle = (req: Request, res: Response): void => {
    const file = req.file;
    if (!file) {
      throw new ValidationError('A CSV file is required in the "file" field');
    }

    // Multer named the file <uuid>.csv — that uuid is the public fileId.
    const fileId = path.parse(file.filename).name;
    const stored = this.files.register({
      id: fileId,
      path: file.path,
      originalName: file.originalname,
      sizeBytes: file.size,
    });

    const body: UploadResponse = {
      fileId: stored.id,
      filename: stored.originalName,
      sizeBytes: stored.sizeBytes,
      uploadedAt: stored.uploadedAt.toISOString(),
      expiresAt: stored.expiresAt.toISOString(),
    };
    res.status(201).json(body);
  };
}
