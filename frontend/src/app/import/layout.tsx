import type { ReactNode } from "react";
import { Stepper } from "@/features/import/components/stepper";
import { ImportFlowProvider } from "@/features/import/import-flow-context";

/**
 * Shared frame for the import journey: one stepper, one flow-state provider.
 * Individual pages only render their step's content.
 */
export default function ImportLayout({ children }: { children: ReactNode }) {
  return (
    <ImportFlowProvider>
      <div className="container max-w-4xl space-y-8 py-8 sm:py-12">
        <Stepper />
        {children}
      </div>
    </ImportFlowProvider>
  );
}
