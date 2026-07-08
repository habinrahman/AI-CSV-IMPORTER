"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the ROOT layout itself,
 * where app/error.tsx cannot help. It replaces the entire document, so it
 * must render its own <html>/<body> and cannot rely on providers, theme, or
 * any component that assumes the layout mounted — inline styles only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went badly wrong
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            The application failed to render. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
