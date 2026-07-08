"use client";

import { useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type HeaderContext,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/states/empty-state";
import { cn } from "@/lib/utils";

const ESTIMATED_ROW_HEIGHT = 41;

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyTitle?: string;
  emptyDescription?: string;
  /**
   * Rendering strategy for large data. Pagination and virtualization solve
   * the same problem two different ways, so they are exclusive modes:
   *  - default: paginated (pageSize rows per page)
   *  - virtualized: one scroll container with sticky header; only visible
   *    rows are rendered (TanStack Virtual)
   */
  virtualized?: boolean;
  /** Scroll viewport height in virtualized mode. */
  maxHeight?: number;
  pageSize?: number;
  enableSorting?: boolean;
}

/**
 * Reusable TanStack table over shadcn's table primitives.
 *
 * Renders its own scroll container with a bare <table> instead of shadcn's
 * <Table>, because that component ships its own overflow wrapper — nesting
 * two scroll containers breaks sticky headers and virtualizer measurement.
 * Horizontal and vertical scrolling live on the same container, so the page
 * itself never scrolls sideways on mobile.
 */
export function DataTable<TData>({
  columns,
  data,
  emptyTitle = "No data",
  emptyDescription,
  virtualized = false,
  maxHeight = 480,
  pageSize = 10,
  enableSorting = true,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    ...(enableSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(virtualized ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    initialState: { pagination: { pageSize } },
  });

  const rows = table.getRowModel().rows;

  // Hooks must run unconditionally; `enabled` keeps the virtualizer inert
  // (no measurement or bookkeeping) in paginated mode.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
    enabled: virtualized,
  });

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems[0]?.start ?? 0;
  const paddingBottom =
    virtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end ?? 0);

  const renderedRows = virtualized
    ? virtualItems.map((item) => rows[item.index]).filter((row) => row !== undefined)
    : rows;

  const { pageIndex } = table.getState().pagination;
  const pageCount = table.getPageCount();

  return (
    <div className="space-y-3">
      <div
        ref={scrollRef}
        className="overflow-auto rounded-lg border"
        style={virtualized ? { maxHeight } : undefined}
      >
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_hsl(var(--border))]">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="whitespace-nowrap bg-background"
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {virtualized && paddingTop > 0 ? (
              <tr aria-hidden>
                <td colSpan={columns.length} style={{ height: paddingTop, padding: 0 }} />
              </tr>
            ) : null}
            {renderedRows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="max-w-64 truncate">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {virtualized && paddingBottom > 0 ? (
              <tr aria-hidden>
                <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0 }} />
              </tr>
            ) : null}
          </TableBody>
        </table>
      </div>

      {!virtualized && pageCount > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Sortable column header: click cycles none → asc → desc. */
export function sortableHeader<TData>(label: string) {
  function SortableHeaderCell({ column }: HeaderContext<TData, unknown>) {
    const sorted = column.getIsSorted();
    return (
      <Button
        variant="ghost"
        size="sm"
        className={cn("-ml-2 h-8 gap-1 px-2 font-medium", sorted && "text-foreground")}
        onClick={() => column.toggleSorting(sorted === "asc")}
      >
        {label}
        {sorted === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
        ) : sorted === "desc" ? (
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />
        )}
      </Button>
    );
  }
  return SortableHeaderCell;
}

/**
 * Columns for arbitrary CSV data. Uses accessorFn (not accessorKey) because
 * real-world CSV headers contain dots, which TanStack would treat as nested
 * object paths.
 */
export function csvColumns(headers: string[]): ColumnDef<Record<string, string>, unknown>[] {
  return headers.map((header) => ({
    id: header,
    accessorFn: (row) => row[header] ?? "",
    header: sortableHeader<Record<string, string>>(header),
    cell: (ctx) => {
      const value = ctx.getValue<string>();
      return value === "" ? <span className="text-muted-foreground">—</span> : value;
    },
  }));
}
