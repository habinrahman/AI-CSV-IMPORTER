import type { ParseResponse } from "@groweasy/shared";
import type { CsvParser } from "../services/csv/csv-parse.service";
import type { FileStorage } from "../services/files/file-storage.service";
import type { ParseRequest } from "../validators/parse.validator";
import { asyncHandler } from "../utils/async-handler";
import { NotFoundError } from "../utils/errors";

export class ParseController {
  constructor(
    private readonly files: FileStorage,
    private readonly csv: CsvParser,
  ) {}

  handle = asyncHandler(async (req, res) => {
    // Body is already validated + typed by validateBody(parseRequestSchema).
    const { fileId, previewRows } = req.body as ParseRequest;

    const stored = this.files.get(fileId);
    if (!stored) {
      throw new NotFoundError(
        `No uploaded file found for id "${fileId}" — it may have expired; upload again`,
      );
    }

    const preview = await this.csv.preview(stored.path, previewRows);

    const body: ParseResponse = {
      fileId,
      filename: stored.originalName,
      headers: preview.headers,
      rows: preview.rows,
      totalRows: preview.totalRows,
    };
    res.json(body);
  });
}
