import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page itself is a client component; this pass-through server layout
// exists solely to give the route its own tab title.
export const metadata: Metadata = { title: "Upload CSV" };

export default function UploadLayout({ children }: { children: ReactNode }) {
  return children;
}
