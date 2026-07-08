import {
  CheckCircle2,
  CircleDashed,
  PhoneMissed,
  ThumbsDown,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { CrmStatus } from "@groweasy/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Status colors follow the reserved status palette (docs: dataviz reference —
 * fixed across themes, never reused for series). A status is always rendered
 * as icon + label: color alone never carries the meaning, and the label text
 * stays in foreground ink.
 */
interface StatusStyle {
  label: string;
  icon: LucideIcon;
  /** Icon + tint classes; label text stays in ink. */
  iconClass: string;
  tintClass: string;
}

const STATUS_STYLES: Record<CrmStatus, StatusStyle> = {
  SALE_DONE: {
    label: "Sale done",
    icon: CheckCircle2,
    iconClass: "text-[#0ca30c]",
    tintClass: "bg-[#0ca30c]/10 border-[#0ca30c]/25",
  },
  GOOD_LEAD_FOLLOW_UP: {
    label: "Follow up",
    icon: UserCheck,
    iconClass: "text-[#2a78d6] dark:text-[#3987e5]",
    tintClass:
      "bg-[#2a78d6]/10 border-[#2a78d6]/25 dark:bg-[#3987e5]/10 dark:border-[#3987e5]/25",
  },
  DID_NOT_CONNECT: {
    label: "Did not connect",
    icon: PhoneMissed,
    iconClass: "text-[#a97505] dark:text-[#fab219]",
    tintClass: "bg-[#fab219]/10 border-[#fab219]/30",
  },
  BAD_LEAD: {
    label: "Bad lead",
    icon: ThumbsDown,
    iconClass: "text-[#d03b3b]",
    tintClass: "bg-[#d03b3b]/10 border-[#d03b3b]/25",
  },
};

export function StatusBadge({ status }: { status: CrmStatus | null }) {
  if (status === null) {
    return (
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
        <CircleDashed className="h-3 w-3" aria-hidden />
        Unclassified
      </Badge>
    );
  }

  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-normal text-foreground", style.tintClass)}
    >
      <Icon className={cn("h-3 w-3", style.iconClass)} aria-hidden />
      {style.label}
    </Badge>
  );
}
