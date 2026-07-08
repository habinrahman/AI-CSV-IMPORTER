import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /** Accessible description of what is loading. */
  label?: string;
  className?: string;
}

/** Generic block-level loading placeholder. */
export function LoadingState({ label = "Loading", className }: LoadingStateProps) {
  return (
    <div role="status" aria-label={label} className={cn("flex flex-col gap-3", className)}>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Table-shaped skeleton for data views (preview, results). */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading table" className={cn("space-y-2", className)}>
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
      <span className="sr-only">Loading table…</span>
    </div>
  );
}
