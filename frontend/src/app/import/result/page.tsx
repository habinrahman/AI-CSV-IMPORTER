"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Download, FileUp, RotateCcw } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { FailedRow, MappedLead, RowWarning, SkippedRow } from "@groweasy/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { TableSkeleton } from "@/components/states/loading-state";
import { FadeIn } from "@/components/motion/fade-in";
import { StatsCards } from "@/features/import/components/stats-cards";
import { useImportResult } from "@/features/import/hooks/use-import-result";
import { useImportFlow } from "@/features/import/import-flow-context";
import { StatusBadge } from "@/features/import/status";
import { ApiError } from "@/lib/api/client";

function textOrDash(value: string) {
  return value === "" ? <span className="text-muted-foreground">—</span> : value;
}

function textColumn(
  id: keyof MappedLead & string,
  header: string,
): ColumnDef<MappedLead, unknown> {
  return {
    id,
    header,
    accessorFn: (row) => row[id] as string,
    cell: (ctx) => textOrDash(ctx.getValue<string>()),
  };
}

// Every CRM field the pipeline extracts — the table scrolls horizontally.
const leadColumns: ColumnDef<MappedLead, unknown>[] = [
  textColumn("created_at", "Created at"),
  { id: "name", header: "Name", accessorFn: (row) => row.name },
  textColumn("email", "Email"),
  {
    id: "mobile",
    header: "Mobile",
    accessorFn: (row) =>
      row.mobile_without_country_code === ""
        ? ""
        : `${row.country_code} ${row.mobile_without_country_code}`,
    cell: (ctx) => textOrDash(ctx.getValue<string>()),
  },
  textColumn("company", "Company"),
  textColumn("city", "City"),
  textColumn("state", "State"),
  textColumn("country", "Country"),
  textColumn("lead_owner", "Owner"),
  {
    id: "crm_status",
    header: "Status",
    accessorFn: (row) => row.crm_status,
    cell: (ctx) => <StatusBadge status={ctx.row.original.crm_status} />,
  },
  textColumn("data_source", "Source"),
  textColumn("possession_time", "Possession"),
  {
    id: "confidence",
    header: "Confidence",
    accessorFn: (row) => row.confidence,
    cell: (ctx) => `${Math.round(ctx.getValue<number>() * 100)}%`,
  },
  {
    id: "crm_note",
    header: "CRM note",
    accessorFn: (row) => row.crm_note,
    cell: (ctx) => (
      <span title={ctx.getValue<string>()} className="block max-w-64 truncate">
        {ctx.getValue<string>()}
      </span>
    ),
  },
  {
    id: "description",
    header: "Description",
    accessorFn: (row) => row.description,
    cell: (ctx) => (
      <span title={ctx.getValue<string>()} className="block max-w-64 truncate">
        {textOrDash(ctx.getValue<string>())}
      </span>
    ),
  },
];

function rawSummaryColumn<T extends { raw: Record<string, string> }>(): ColumnDef<T, unknown> {
  return {
    id: "raw",
    header: "Original data",
    accessorFn: (row) => Object.values(row.raw).filter(Boolean).join(" · "),
    cell: (ctx) => (
      <span title={ctx.getValue<string>()} className="block max-w-80 truncate">
        {ctx.getValue<string>()}
      </span>
    ),
  };
}

const skippedColumns: ColumnDef<SkippedRow, unknown>[] = [
  { id: "row", header: "Row", accessorFn: (row) => row.rowIndex + 1 },
  { id: "reason", header: "Reason", accessorFn: (row) => row.reason },
  rawSummaryColumn<SkippedRow>(),
];

const failedColumns: ColumnDef<FailedRow, unknown>[] = [
  { id: "row", header: "Row", accessorFn: (row) => row.rowIndex + 1 },
  { id: "message", header: "Error", accessorFn: (row) => row.message },
  rawSummaryColumn<FailedRow>(),
];

const warningColumns: ColumnDef<RowWarning, unknown>[] = [
  { id: "row", header: "Row", accessorFn: (row) => row.rowIndex + 1 },
  { id: "message", header: "Warning", accessorFn: (row) => row.message },
];

/**
 * Client-side CSV export of the mapped leads — exact GrowEasy CRM column
 * order from the assignment's sample records. Papa quotes embedded commas
 * and newlines, so every record stays one valid CSV row.
 */
function exportRecordsCsv(records: MappedLead[]): void {
  const csv = Papa.unparse(
    records.map((r) => ({
      created_at: r.created_at,
      name: r.name,
      email: r.email,
      country_code: r.country_code,
      mobile_without_country_code: r.mobile_without_country_code,
      company: r.company,
      city: r.city,
      state: r.state,
      country: r.country,
      lead_owner: r.lead_owner,
      crm_status: r.crm_status ?? "",
      crm_note: r.crm_note,
      data_source: r.data_source,
      possession_time: r.possession_time,
      description: r.description,
    })),
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "groweasy-import.csv";
  // Attach before click (some browsers ignore detached anchors) and revoke on
  // the next tick — a synchronous revoke can cancel the read of a large blob.
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast.success(
    `Exported ${records.length.toLocaleString()} lead${records.length === 1 ? "" : "s"} to CSV`,
  );
}

export default function ResultPage() {
  const router = useRouter();
  const { importState, setFile } = useImportFlow();
  const jobId = importState.status === "started" ? importState.jobId : null;
  const result = useImportResult(jobId);

  if (!jobId) {
    return (
      <EmptyState
        icon={FileUp}
        title="No completed import"
        description="Run an import first — results appear here when it finishes."
        action={
          <Button onClick={() => router.push("/import/upload")}>Go to upload</Button>
        }
      />
    );
  }

  if (result.isPending) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading results">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <TableSkeleton rows={8} />
      </div>
    );
  }

  if (result.isError) {
    const message =
      result.error instanceof ApiError
        ? result.error.message
        : "Could not load the import result.";
    return (
      <ErrorState
        title="Could not load results"
        description={message}
        action={
          <Button variant="outline" onClick={() => void result.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const { records, skipped, errors, warnings, stats } = result.data;

  return (
    <FadeIn className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import result</h1>
        <p className="mt-1 text-muted-foreground">
          Review the mapped leads, then export or start another import.
        </p>
      </div>

      <StatsCards stats={stats} />

      <Tabs defaultValue="records">
        <TabsList>
          <TabsTrigger value="records">Records ({records.length})</TabsTrigger>
          <TabsTrigger value="skipped">Skipped ({skipped.length})</TabsTrigger>
          <TabsTrigger value="failed">Errors ({errors.length})</TabsTrigger>
          <TabsTrigger value="warnings">Warnings ({warnings.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="records" className="mt-4">
          <DataTable
            columns={leadColumns}
            data={records}
            emptyTitle="No records imported"
            emptyDescription="Every row was skipped or failed — check the other tabs."
          />
        </TabsContent>
        <TabsContent value="skipped" className="mt-4">
          <DataTable
            columns={skippedColumns}
            data={skipped}
            emptyTitle="Nothing was skipped"
            emptyDescription="Every row had an email or mobile number."
          />
        </TabsContent>
        <TabsContent value="failed" className="mt-4">
          <DataTable
            columns={failedColumns}
            data={errors}
            emptyTitle="No errors"
            emptyDescription="Every processed row mapped and validated successfully."
          />
        </TabsContent>
        <TabsContent value="warnings" className="mt-4">
          <DataTable
            columns={warningColumns}
            data={warnings}
            emptyTitle="No warnings"
            emptyDescription="No values were discarded and every mapping was confident."
          />
        </TabsContent>
      </Tabs>

      <div className="flex flex-col justify-end gap-3 sm:flex-row">
        <Button variant="outline" size="lg" asChild>
          <Link href="/import/upload" onClick={() => setFile(null)}>
            <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
            New import
          </Link>
        </Button>
        <Button
          size="lg"
          disabled={records.length === 0}
          onClick={() => exportRecordsCsv(records)}
        >
          <Download className="mr-1 h-4 w-4" aria-hidden />
          Export CSV
        </Button>
      </div>
    </FadeIn>
  );
}
