import type { Metadata } from "next";
import type { ReactNode } from "react";

// Pass-through server layout: per-route tab title for a client page.
export const metadata: Metadata = { title: "Import results" };

export default function ResultLayout({ children }: { children: ReactNode }) {
  return children;
}
