"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/** Mirrors the SSE `progress` event contract — M10 feeds real events here. */
export interface ImportProgressData {
  phase: "queued" | "parsing" | "mapping" | "completed";
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  failedRows: number;
  currentBatch: number;
  totalBatches: number;
}

const PHASE_LABELS: Record<ImportProgressData["phase"], string> = {
  queued: "Waiting to start",
  parsing: "Reading the CSV",
  mapping: "AI is mapping your leads",
  completed: "Import complete",
};

export function ImportProgress({ data }: { data: ImportProgressData }) {
  const percent = data.totalRows > 0 ? Math.round((data.processedRows / data.totalRows) * 100) : 0;
  const inFlight = data.phase !== "completed";

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {inFlight ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> : null}
          {/* role="status" announces PHASE changes to screen readers —
              phases change a handful of times, row counts change constantly;
              announcing the latter would be noise. */}
          <span role="status">{PHASE_LABELS[data.phase]}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Radix Progress renders role="progressbar" + aria-value* itself —
            the label rides on it directly (a wrapper role would nest two
            progressbars, invalid ARIA). Meter spec: the unfilled track is a
            lighter step of the fill's own ramp (blue-on-blue). */}
        <Progress value={percent} aria-label="Import progress" className="h-2 bg-primary/15" />

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">
            {data.processedRows.toLocaleString()} of {data.totalRows.toLocaleString()} rows
          </span>
          <span className="text-muted-foreground">
            {data.phase === "mapping" && data.totalBatches > 0
              ? `Batch ${data.currentBatch} of ${data.totalBatches} · ${percent}%`
              : `${percent}%`}
          </span>
        </div>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{data.skippedRows.toLocaleString()} skipped</span>
          <span>{data.failedRows.toLocaleString()} failed</span>
        </div>
      </CardContent>
    </Card>
  );
}
