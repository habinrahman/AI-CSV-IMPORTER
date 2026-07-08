"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UploadResponse } from "@groweasy/shared";
import { ApiError, startImport } from "@/lib/api/client";

/**
 * The import-start state machine. It lives in the PROVIDER, not a page:
 * clicking "Start AI import" navigates to the progress page immediately
 * (optimistic UI) while the request keeps running here — a page unmount
 * can never orphan it.
 */
export type ImportStartState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "started"; jobId: string }
  | { status: "error"; message: string };

interface ImportFlowState {
  file: File | null;
  /** Set the file; changing or clearing it always invalidates the upload. */
  setFile: (file: File | null) => void;
  upload: UploadResponse | null;
  setUpload: (upload: UploadResponse | null) => void;
  importState: ImportStartState;
  /** Fire-and-track: safe to call then navigate away instantly. */
  beginImport: (fileId: string) => void;
  /** Back to idle (e.g. retry after a failed start). */
  resetImport: () => void;
}

const ImportFlowContext = createContext<ImportFlowState | null>(null);

export function ImportFlowProvider({ children }: { children: ReactNode }) {
  const [file, setFileState] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [importState, setImportState] = useState<ImportStartState>({ status: "idle" });
  // Guards the async callback: a stale start (superseded by a new file or a
  // reset) must not overwrite newer state.
  const startToken = useRef(0);

  const resetImport = useCallback(() => {
    startToken.current += 1;
    setImportState({ status: "idle" });
  }, []);

  const setFile = useCallback(
    (next: File | null) => {
      setFileState(next);
      // A different (or removed) file makes the previous fileId meaningless.
      setUpload(null);
      resetImport();
    },
    [resetImport],
  );

  const beginImport = useCallback((fileId: string) => {
    const token = ++startToken.current;
    setImportState({ status: "starting" });
    startImport(fileId)
      .then((response) => {
        if (startToken.current !== token) return;
        setImportState({ status: "started", jobId: response.jobId });
      })
      .catch((error: unknown) => {
        if (startToken.current !== token) return;
        const message =
          error instanceof ApiError
            ? error.message
            : "Could not start the import — please try again.";
        setImportState({ status: "error", message });
      });
  }, []);

  const value = useMemo(
    () => ({ file, setFile, upload, setUpload, importState, beginImport, resetImport }),
    [file, setFile, upload, importState, beginImport, resetImport],
  );
  return <ImportFlowContext.Provider value={value}>{children}</ImportFlowContext.Provider>;
}

export function useImportFlow(): ImportFlowState {
  const context = useContext(ImportFlowContext);
  if (!context) {
    throw new Error("useImportFlow must be used inside ImportFlowProvider");
  }
  return context;
}
