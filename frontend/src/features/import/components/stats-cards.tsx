"use client";

import { CheckCircle2, FileSpreadsheet, SkipForward, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ImportStats } from "@groweasy/shared";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * KPI row following the stat-tile contract: label in sentence case, value in
 * sans semibold with proportional figures (no tabular-nums at display size),
 * value text in ink — the colored icon chip carries state, never the number.
 * Status colors are the reserved palette and always ship icon + label.
 */
interface StatTile {
  label: string;
  value: number;
  icon: LucideIcon;
  chipClass: string;
}

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatValue(value: number): string {
  return value >= 10_000 ? compact.format(value) : value.toLocaleString();
}

export function StatsCards({ stats }: { stats: ImportStats }) {
  const tiles: StatTile[] = [
    {
      label: "Total rows",
      value: stats.totalRows,
      icon: FileSpreadsheet,
      chipClass: "bg-muted text-muted-foreground",
    },
    {
      label: "Imported",
      value: stats.imported,
      icon: CheckCircle2,
      chipClass: "bg-[#0ca30c]/10 text-[#0ca30c]",
    },
    {
      label: "Skipped",
      value: stats.skipped,
      icon: SkipForward,
      chipClass: "bg-[#fab219]/15 text-[#a97505] dark:text-[#fab219]",
    },
    {
      label: "Failed",
      value: stats.failed,
      icon: XCircle,
      chipClass: "bg-[#d03b3b]/10 text-[#d03b3b]",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Card
            key={tile.label}
            className="transition-colors duration-200 hover:border-foreground/20"
          >
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("rounded-md p-2", tile.chipClass)}>
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-tight">
                  <AnimatedNumber value={tile.value} format={formatValue} />
                </p>
                <p className="truncate text-sm text-muted-foreground">{tile.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
