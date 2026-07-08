"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, FileUp, WifiOff } from "lucide-react";
import { toast } from "sonner";
import type { ImportJobSnapshot } from "@groweasy/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { FadeIn } from "@/components/motion/fade-in";
import {
  ImportProgress,
  type ImportProgressData,
} from "@/features/import/components/import-progress";
import { useImportJobProgress } from "@/features/import/hooks/use-import-progress";
import { useImportFlow } from "@/features/import/import-flow-context";
import { cancelImport } from "@/lib/api/client";

/** The server's terminal error for a user-initiated cancel (API contract). */
const CANCELLED_MESSAGE = "Import was cancelled";

const STARTING: ImportProgressData = {
  phase: "queued",
  totalRows: 0,
  processedRows: 0,
  skippedRows: 0,
  failedRows: 0,
  currentBatch: 0,
  totalBatches: 0,
};

function toProgressData(snapshot: ImportJobSnapshot): ImportProgressData {
  const phase =
    snapshot.status === "completed"
      ? "completed"
      : snapshot.status === "parsing"
        ? "parsing"
        : snapshot.status === "mapping"
          ? "mapping"
          : "queued";
  return { phase, ...snapshot.progress };
}

export default function ProgressPage() {
  const router = useRouter();
  const { importState, resetImport } = useImportFlow();
  const jobId = importState.status === "started" ? importState.jobId : null;
  const { snapshot, polling } = useImportJobProgress(jobId);

  const isDone = snapshot?.status === "completed";
  const isFailed = snapshot?.status === "failed";
  const isCancelled = isFailed && snapshot?.error === CANCELLED_MESSAGE;
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async (): Promise<void> => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await cancelImport(jobId);
      // The terminal "failed" event (via SSE or polling) drives the UI and
      // the toast — same single-source-of-truth path as normal completion.
    } catch (err) {
      setCancelling(false);
      toast.error("Could not cancel the import", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // The moment the job completes, move on — results are the destination.
  // The ref keeps StrictMode double-effects and re-renders from double-toasting.
  const notified = useRef(false);
  useEffect(() => {
    if (isDone && !notified.current) {
      notified.current = true;
      const imported = snapshot?.stats?.imported;
      toast.success(
        imported !== undefined
          ? `Import complete — ${imported.toLocaleString()} lead${imported === 1 ? "" : "s"} imported`
          : "Import complete",
      );
      router.push("/import/result");
    }
    if (isFailed && !notified.current) {
      notified.current = true;
      if (isCancelled) {
        toast.info("Import cancelled");
      } else {
        toast.error("Import failed", { description: snapshot?.error });
      }
    }
  }, [isDone, isFailed, isCancelled, snapshot, router]);

  if (importState.status === "idle") {
    return (
      <EmptyState
        icon={FileUp}
        title="No import running"
        description="Upload a CSV and start an import first."
        action={
          <Button onClick={() => router.push("/import/upload")}>Go to upload</Button>
        }
      />
    );
  }

  if (importState.status === "error") {
    return (
      <ErrorState
        title="Could not start the import"
        description={importState.message}
        action={
          <Button
            variant="outline"
            onClick={() => {
              resetImport();
              router.push("/import/preview");
            }}
          >
            Back to preview
          </Button>
        }
      />
    );
  }

  if (isFailed) {
    return (
      <ErrorState
        title={isCancelled ? "Import cancelled" : "Import failed"}
        description={
          isCancelled
            ? "No records were written. Your file is still uploaded — you can start again from the preview."
            : (snapshot?.error ?? "The import could not be completed.")
        }
        action={
          <Button
            variant="outline"
            onClick={() => {
              resetImport();
              router.push("/import/preview");
            }}
          >
            Back to preview
          </Button>
        }
      />
    );
  }

  const data = snapshot ? toProgressData(snapshot) : STARTING;

  return (
    <FadeIn className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importing</h1>
        <p className="mt-1 text-muted-foreground">
          Rows are mapped in batches — you can watch each one land.
        </p>
      </div>

      <ImportProgress data={data} />

      {polling ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <WifiOff className="h-4 w-4" aria-hidden />
          Live connection lost — falling back to polling every 2 seconds.
        </p>
      ) : null}

      <div aria-live="polite" className="flex flex-wrap justify-end gap-3">
        {isDone ? (
          <Button size="lg" onClick={() => router.push("/import/result")}>
            View results
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" variant="outline" disabled={cancelling || !jobId}>
                  <Ban className="mr-1 h-4 w-4" aria-hidden />
                  {cancelling ? "Cancelling…" : "Cancel import"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this import?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Mapping stops immediately and nothing is written to the CRM.
                    Rows processed so far are discarded — you can start over from
                    the preview at any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep running</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "destructive" })}
                    onClick={() => void handleCancel()}
                  >
                    Cancel import
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="lg" disabled>
              {snapshot ? "Mapping in progress…" : "Starting import…"}
            </Button>
          </>
        )}
      </div>
    </FadeIn>
  );
}
