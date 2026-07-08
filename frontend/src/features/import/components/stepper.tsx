"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMPORT_STEPS } from "../steps";

/**
 * Horizontal step indicator for the import journey. The active step derives
 * from the pathname, so the layout needs no prop drilling. Mobile shows
 * number + current label only; step names appear from `sm:` up.
 */
export function Stepper() {
  const pathname = usePathname();
  const activeIndex = Math.max(
    IMPORT_STEPS.findIndex((step) => pathname.startsWith(step.path)),
    0,
  );

  return (
    <nav aria-label="Import progress">
      <ol className="flex items-center gap-2 sm:gap-3">
        {IMPORT_STEPS.map((step, index) => {
          const isDone = index < activeIndex;
          const isCurrent = index === activeIndex;
          return (
            <li key={step.path} className="flex flex-1 items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    isDone && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary text-primary",
                    !isDone && !isCurrent && "border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    isCurrent ? "text-foreground" : "hidden text-muted-foreground sm:inline",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < IMPORT_STEPS.length - 1 ? (
                <div
                  aria-hidden
                  className={cn("h-px flex-1", index < activeIndex ? "bg-primary" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
