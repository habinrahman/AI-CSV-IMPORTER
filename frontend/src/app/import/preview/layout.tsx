import type { Metadata } from "next";
import type { ReactNode } from "react";

// Pass-through server layout: per-route tab title for a client page.
export const metadata: Metadata = { title: "Preview & confirm" };

export default function PreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
