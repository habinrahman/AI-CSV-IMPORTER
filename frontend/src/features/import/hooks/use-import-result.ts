"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchImportResult } from "@/lib/api/client";

/** The completed import's full outcome. Immutable once fetched. */
export function useImportResult(jobId: string | null) {
  return useQuery({
    queryKey: ["import-result", jobId],
    queryFn: () => fetchImportResult(jobId as string),
    enabled: Boolean(jobId),
    staleTime: Infinity, // a finished import never changes
    retry: 1,
  });
}
