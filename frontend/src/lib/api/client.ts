import {
  ImportJobSnapshotSchema,
  StartImportResponseSchema,
  UploadResponseSchema,
  type ApiErrorResponse,
  type ImportJobSnapshot,
  type ImportResultResponse,
  type StartImportRequestBody,
  type StartImportResponse,
  type UploadResponse,
} from "@groweasy/shared";

/**
 * Typed client for the GrowEasy backend. All request/response shapes come
 * from @groweasy/shared — this file only handles transport.
 */

// Trailing slashes in the env value would produce "//api/…" paths that miss
// every Express route — normalize so sloppy platform config can't break us.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** A non-2xx response from the API, carrying the server's error envelope. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function toApiError(body: unknown, status: number, fallback: string): ApiError {
  if (body && typeof body === "object" && "error" in body) {
    const { error } = body as ApiErrorResponse;
    return new ApiError(error.message ?? fallback, status, error.requestId, error.details);
  }
  return new ApiError(fallback, status);
}

/** Structural view of a Zod schema — keeps zod out of this package's deps. */
interface WireSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * A 2xx body that violates the shared contract must fail loudly here, not
 * corrupt the UI downstream (e.g. NaN% from a missing progress object).
 */
function validated<T>(schema: WireSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError("The API returned an unexpected response shape", 200);
  }
  return result.data;
}

export interface UploadOptions {
  /** Called with 0–100 as the browser sends the file. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * POST /api/upload via XMLHttpRequest — fetch still cannot report upload
 * progress, and progress is a product requirement, not a nicety.
 */
export function uploadCsv(file: File, options: UploadOptions = {}): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/upload`);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(validated(UploadResponseSchema, xhr.response));
        } catch (err) {
          reject(err instanceof Error ? err : new ApiError("Unexpected upload response", 200));
        }
      } else {
        reject(toApiError(xhr.response, xhr.status, `Upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError("Could not reach the API — is the backend running?", 0));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));

    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** True when an error is a user-initiated cancellation, not a failure. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** JSON request helper with the server's error envelope decoded. */
async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Could not reach the API — is the backend running?", 0);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw toApiError(body, response.status, `Request failed (HTTP ${response.status})`);
  }
  return body as T;
}

/** POST /api/imports — start the AI import for an uploaded file. */
export async function startImport(fileId: string): Promise<StartImportResponse> {
  const body: StartImportRequestBody = { fileId };
  const response = await requestJson<unknown>("/api/imports", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return validated(StartImportResponseSchema, response);
}

/**
 * DELETE /api/imports/:id — cancel a running import (idempotent on the
 * server). The terminal "failed" event arrives through SSE/polling as usual;
 * callers should let that drive the UI rather than the response here.
 */
export async function cancelImport(jobId: string): Promise<ImportJobSnapshot> {
  return parseImportSnapshot(
    await requestJson<unknown>(`/api/imports/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    }),
  );
}

/** Parse + validate one job snapshot (shared by polling and SSE frames). */
export function parseImportSnapshot(value: unknown): ImportJobSnapshot {
  return validated(ImportJobSnapshotSchema, value);
}

/** GET /api/imports/:id — snapshot (polling fallback when SSE drops). */
export async function fetchImportSnapshot(jobId: string): Promise<ImportJobSnapshot> {
  return parseImportSnapshot(
    await requestJson<unknown>(`/api/imports/${encodeURIComponent(jobId)}`),
  );
}

/**
 * GET /api/imports/:id/result — the full outcome once completed.
 * Validated shallowly on purpose: the payload can be tens of thousands of
 * rows, and deep Zod validation on the client would cost real main-thread
 * time for data our own backend already validated row-by-row.
 */
export async function fetchImportResult(jobId: string): Promise<ImportResultResponse> {
  const body = await requestJson<ImportResultResponse>(
    `/api/imports/${encodeURIComponent(jobId)}/result`,
  );
  const looksValid =
    body !== null &&
    typeof body === "object" &&
    Array.isArray(body.records) &&
    Array.isArray(body.skipped) &&
    Array.isArray(body.errors) &&
    Array.isArray(body.warnings) &&
    typeof body.stats?.totalRows === "number";
  if (!looksValid) {
    throw new ApiError("The API returned an unexpected response shape", 200);
  }
  return body;
}

/** URL for the SSE progress stream (consumed via EventSource). */
export function importEventsUrl(jobId: string): string {
  return `${API_URL}/api/imports/${encodeURIComponent(jobId)}/events`;
}
