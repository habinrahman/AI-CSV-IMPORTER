"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, FileUp, Sparkles } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { DataTable, csvColumns } from "@/components/data-table";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { TableSkeleton } from "@/components/states/loading-state";
import { FadeIn } from "@/components/motion/fade-in";
import {
  PREVIEW_ROW_LIMIT,
  useCsvPreview,
} from "@/features/import/hooks/use-csv-preview";
import { useImportFlow } from "@/features/import/import-flow-context";

export default function PreviewPage() {
  const router = useRouter();
  const { file, upload, importState, beginImport } = useImportFlow();
  const preview = useCsvPreview(file);

  // Optimistic UI: navigate immediately; the start request keeps running in
  // the flow provider and the progress page renders its outcome.
  const handleStartImport = (): void => {
    if (!upload) {
      router.push("/import/upload");
      return;
    }
    beginImport(upload.fileId);
    router.push("/import/progress");
  };

  if (!file) {
    return (
      <EmptyState
        icon={FileUp}
        title="No file selected"
        description="Pick a CSV on the upload step first — the preview parses it right in your browser."
        action={
          <Button asChild>
            <Link href="/import/upload">Go to upload</Link>
          </Button>
        }
      />
    );
  }

  return (
    <FadeIn className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Preview</h1>
        <p className="mt-1 text-muted-foreground">
          {file.name}
          {preview.status === "success" ? (
            <>
              {" · "}
              {preview.headers.length.toLocaleString()} columns
              {" · "}
              {preview.truncated
                ? `first ${PREVIEW_ROW_LIMIT.toLocaleString()} rows`
                : `${preview.rows.length.toLocaleString()} rows`}
            </>
          ) : null}
        </p>
      </div>

      {preview.status === "parsing" ? <TableSkeleton rows={8} /> : null}

      {preview.status === "error" ? (
        <ErrorState
          title="Could not read this file"
          description={preview.errorMessage ?? "The file does not look like a valid CSV."}
          action={
            <Button variant="outline" onClick={() => router.push("/import/upload")}>
              Choose a different file
            </Button>
          }
        />
      ) : null}

      {preview.status === "success" ? (
        <>
          {preview.problemRowCount > 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-[#a97505] dark:text-[#fab219]" aria-hidden />
              {preview.problemRowCount.toLocaleString()} row
              {preview.problemRowCount === 1 ? " has" : "s have"} an unusual shape (extra or
              missing fields) — they will still be sent to the import.
            </p>
          ) : null}

          <DataTable
            columns={csvColumns(preview.headers)}
            data={preview.rows}
            virtualized
            maxHeight={480}
            emptyTitle="No data rows"
            emptyDescription="This file has a header row but no data underneath it."
          />
        </>
      ) : null}

      <div className="flex justify-between">
        <Button variant="outline" size="lg" onClick={() => router.push("/import/upload")}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
          Back
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="lg"
              disabled={
                preview.status !== "success" ||
                preview.rows.length === 0 ||
                importState.status === "starting"
              }
            >
              Start AI import
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Start the AI import?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {file?.name} will be processed with AI
                {preview.truncated
                  ? " — the preview showed the first rows, but the whole file is imported"
                  : preview.rows.length > 0
                    ? ` (${preview.rows.length.toLocaleString()} rows)`
                    : ""}
                . Rows without an email or phone number are skipped automatically, and you
                review everything before it reaches the CRM.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not yet</AlertDialogCancel>
              <AlertDialogAction onClick={handleStartImport}>
                Start import
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </FadeIn>
  );
}
