"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ImportJobSnapshot } from "@groweasy/shared";
import { fetchImportSnapshot, importEventsUrl, parseImportSnapshot } from "@/lib/api/client";

function isTerminal(snapshot: ImportJobSnapshot | null): boolean {
  return snapshot?.status === "completed" || snapshot?.status === "failed";
}

export interface ImportJobProgressState {
  snapshot: ImportJobSnapshot | null;
  /** True when the live stream dropped and polling took over. */
  polling: boolean;
}

/**
 * Live job progress: SSE first (EventSource on progress/done/failed events —
 * "failed" is a named server event; the transport-level "error" is a
 * different thing and triggers the fallback), with a 2s React Query poll
 * taking over if the stream drops mid-job. Either path ends in a terminal
 * snapshot.
 */
export function useImportJobProgress(jobId: string | null): ImportJobProgressState {
  const [snapshot, setSnapshot] = useState<ImportJobSnapshot | null>(null);
  const [sseFailed, setSseFailed] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    setSnapshot(null);
    setSseFailed(false);

    const source = new EventSource(importEventsUrl(jobId));
    const onSnapshot = (event: MessageEvent): void => {
      try {
        setSnapshot(parseImportSnapshot(JSON.parse(event.data as string)));
      } catch {
        // A malformed or contract-violating frame is ignored; the next event
        // self-heals (every frame is a full snapshot).
      }
    };

    source.addEventListener("progress", onSnapshot);
    source.addEventListener("done", (event) => {
      onSnapshot(event);
      source.close();
    });
    source.addEventListener("failed", (event) => {
      onSnapshot(event);
      source.close();
    });
    source.onerror = () => {
      // Transport problem (proxy hiccup, server restart) — not a job failure.
      source.close();
      setSseFailed(true);
    };

    return () => source.close();
  }, [jobId]);

  const poll = useQuery({
    queryKey: ["import-snapshot", jobId],
    queryFn: () => fetchImportSnapshot(jobId as string),
    enabled: Boolean(jobId) && sseFailed && !isTerminal(snapshot),
    // Terminate on the POLLED snapshot: SSE is dead by now, so `snapshot`
    // is frozen at the last pre-drop frame and can never turn terminal —
    // gating the interval on it would poll forever after the job ends.
    refetchInterval: (query) => (isTerminal(query.state.data ?? null) ? false : 2_000),
  });

  const effective = sseFailed && poll.data ? poll.data : snapshot;
  return {
    snapshot: effective,
    polling: Boolean(jobId) && sseFailed && !isTerminal(effective),
  };
}
