"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states/error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side error reporting hook-point (Sentry etc. would go here).
    console.error(error);
  }, [error]);

  return (
    <div className="container py-16">
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred while rendering this page."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
