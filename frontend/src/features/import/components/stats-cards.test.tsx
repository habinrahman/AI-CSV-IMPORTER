import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ImportStats } from "@groweasy/shared";
import { StatsCards } from "./stats-cards";

// The setup file forces prefers-reduced-motion, so AnimatedNumber renders
// final values synchronously instead of counting up.

function makeStats(overrides: Partial<ImportStats> = {}): ImportStats {
  return {
    totalRows: 120,
    imported: 100,
    skipped: 12,
    failed: 8,
    warnings: 3,
    batches: 4,
    durationMs: 5200,
    ...overrides,
  };
}

/** The value <p> and label <p> share one wrapper; scope queries to a tile. */
function tile(label: string): HTMLElement {
  const labelNode = screen.getByText(label);
  const wrapper = labelNode.parentElement;
  if (!wrapper) throw new Error(`No tile wrapper for ${label}`);
  return wrapper;
}

describe("StatsCards", () => {
  it("renders one tile per outcome with the right values", () => {
    render(<StatsCards stats={makeStats()} />);

    expect(within(tile("Total rows")).getByText("120")).toBeInTheDocument();
    expect(within(tile("Imported")).getByText("100")).toBeInTheDocument();
    expect(within(tile("Skipped")).getByText("12")).toBeInTheDocument();
    expect(within(tile("Failed")).getByText("8")).toBeInTheDocument();
  });

  it("groups thousands and compacts values from 10K up", () => {
    render(
      <StatsCards
        stats={makeStats({ totalRows: 24680, imported: 9876, skipped: 12345, failed: 0 })}
      />,
    );

    // >= 10,000 → compact notation; below → locale grouping.
    expect(within(tile("Total rows")).getByText("24.7K")).toBeInTheDocument();
    expect(within(tile("Imported")).getByText("9,876")).toBeInTheDocument();
    expect(within(tile("Skipped")).getByText("12.3K")).toBeInTheDocument();
    expect(within(tile("Failed")).getByText("0")).toBeInTheDocument();
  });
});
