"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { UploadResponse } from "@groweasy/shared";
import { uploadCsv } from "@/lib/api/client";

/**
 * Upload mutation with live progress and cancellation.
 * Server state (the response) lives in React Query; the progress percentage
 * is view state owned here.
 */
export function useUploadCsv() {
  const [progress, setProgress] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const mutation = useMutation<UploadResponse, Error, File>({
    mutationFn: (file) => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setProgress(0);
      return uploadCsv(file, { onProgress: setProgress, signal: controller.signal });
    },
  });

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setProgress(0);
    resetMutation();
  }, [resetMutation]);

  return {
    upload: mutation.mutateAsync,
    isUploading: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    progress,
    cancel,
    reset,
  };
}
