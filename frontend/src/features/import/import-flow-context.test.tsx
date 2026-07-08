import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StartImportResponse } from "@groweasy/shared";
import { ApiError, startImport } from "@/lib/api/client";
import { ImportFlowProvider, useImportFlow } from "./import-flow-context";

// ApiError must stay real: the provider branches on `instanceof ApiError`
// when turning a rejection into a user-facing message.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, startImport: vi.fn() };
});

const startImportMock = vi.mocked(startImport);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wrapper({ children }: { children: ReactNode }) {
  return <ImportFlowProvider>{children}</ImportFlowProvider>;
}

describe("ImportFlowProvider", () => {
  afterEach(() => {
    startImportMock.mockReset();
  });

  it("throws when useImportFlow is used outside the provider", () => {
    expect(() => renderHook(() => useImportFlow())).toThrow(
      "useImportFlow must be used inside ImportFlowProvider",
    );
  });

  it("beginImport is optimistic: 'starting' synchronously, then 'started' with the jobId", async () => {
    const pending = deferred<StartImportResponse>();
    startImportMock.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useImportFlow(), { wrapper });
    expect(result.current.importState).toEqual({ status: "idle" });

    act(() => result.current.beginImport("file-123"));
    // Synchronous optimistic transition — the caller navigates away right after.
    expect(result.current.importState).toEqual({ status: "starting" });
    expect(startImportMock).toHaveBeenCalledWith("file-123");

    await act(async () => pending.resolve({ jobId: "job-9" }));
    expect(result.current.importState).toEqual({ status: "started", jobId: "job-9" });
  });

  it("surfaces the ApiError message when startImport rejects", async () => {
    const pending = deferred<StartImportResponse>();
    startImportMock.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useImportFlow(), { wrapper });
    act(() => result.current.beginImport("file-123"));

    await act(async () => pending.reject(new ApiError("File not found", 404)));
    expect(result.current.importState).toEqual({ status: "error", message: "File not found" });
  });

  it("uses a generic message for non-ApiError rejections", async () => {
    startImportMock.mockRejectedValue(new TypeError("fetch exploded"));

    const { result } = renderHook(() => useImportFlow(), { wrapper });
    await act(async () => result.current.beginImport("file-123"));

    expect(result.current.importState).toEqual({
      status: "error",
      message: "Could not start the import — please try again.",
    });
  });

  it("a stale start must not overwrite state reset before it resolved (token guard)", async () => {
    const pending = deferred<StartImportResponse>();
    startImportMock.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useImportFlow(), { wrapper });
    act(() => result.current.beginImport("file-old"));
    expect(result.current.importState).toEqual({ status: "starting" });

    // User backs out before the request settles.
    act(() => result.current.resetImport());
    expect(result.current.importState).toEqual({ status: "idle" });

    await act(async () => pending.resolve({ jobId: "job-stale" }));
    expect(result.current.importState).toEqual({ status: "idle" });
  });

  it("changing the file invalidates the upload and any in-flight start", async () => {
    const pending = deferred<StartImportResponse>();
    startImportMock.mockReturnValue(pending.promise);

    const { result } = renderHook(() => useImportFlow(), { wrapper });
    const upload = {
      fileId: "file-old",
      filename: "leads.csv",
      sizeBytes: 10,
      uploadedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T01:00:00.000Z",
    };
    act(() => result.current.setUpload(upload));
    act(() => result.current.beginImport("file-old"));

    // Clearing the file supersedes the pending start AND drops the upload.
    act(() => result.current.setFile(null));
    expect(result.current.upload).toBeNull();
    expect(result.current.importState).toEqual({ status: "idle" });

    await act(async () => pending.resolve({ jobId: "job-stale" }));
    expect(result.current.importState).toEqual({ status: "idle" });
  });
});
