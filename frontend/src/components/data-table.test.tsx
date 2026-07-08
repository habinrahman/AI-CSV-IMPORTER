import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { csvColumns, DataTable } from "./data-table";

type Row = Record<string, string>;

function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    Name: `Person ${String(i + 1).padStart(3, "0")}`,
    Email: `p${i + 1}@example.com`,
  }));
}

/** Data rows only (skips the header row and any aria-hidden spacer rows). */
function dataRows(): HTMLElement[] {
  return screen
    .getAllByRole("row")
    .filter((row) => row.closest("tbody") && !row.hasAttribute("aria-hidden"));
}

function firstDataRow(): HTMLElement {
  const row = dataRows()[0];
  if (!row) throw new Error("No data rows rendered");
  return row;
}

describe("DataTable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when there is no data", () => {
    render(<DataTable columns={csvColumns(["Name"])} data={[]} emptyTitle="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("paginates: pageSize rows per page, Next/Prev navigation", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={csvColumns(["Name", "Email"])} data={makeRows(25)} pageSize={10} />);

    expect(dataRows()).toHaveLength(10);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Person 001")).toBeInTheDocument();
    expect(screen.queryByText("Person 011")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Person 011")).toBeInTheDocument();
    expect(screen.queryByText("Person 001")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
    // 25 rows → last page holds the remaining 5.
    expect(dataRows()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("hides pagination entirely when everything fits on one page", () => {
    render(<DataTable columns={csvColumns(["Name", "Email"])} data={makeRows(4)} pageSize={10} />);
    expect(dataRows()).toHaveLength(4);
    expect(screen.queryByText(/^Page \d/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("sorts on header click, cycling asc → desc, and reflects it in aria-sort", async () => {
    const user = userEvent.setup();
    const data: Row[] = [
      { Name: "Charlie", Email: "c@example.com" },
      { Name: "Alpha", Email: "a@example.com" },
      { Name: "Bravo", Email: "b@example.com" },
    ];
    render(<DataTable columns={csvColumns(["Name", "Email"])} data={data} />);

    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    expect(nameHeader).not.toHaveAttribute("aria-sort");
    expect(within(firstDataRow()).getByText("Charlie")).toBeInTheDocument();

    await user.click(within(nameHeader).getByRole("button"));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    expect(within(firstDataRow()).getByText("Alpha")).toBeInTheDocument();

    await user.click(within(nameHeader).getByRole("button"));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
    expect(within(firstDataRow()).getByText("Charlie")).toBeInTheDocument();
  });

  it("virtualized mode windows rows inside one scroll container", () => {
    // jsdom has no layout, so every element measures 0×0 and the virtualizer
    // would compute an empty window. TanStack Virtual reads offsetWidth /
    // offsetHeight for the scroll container — give it a real viewport.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(480);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);

    const { container } = render(
      <DataTable
        columns={csvColumns(["Name", "Email"])}
        data={makeRows(1000)}
        virtualized
        maxHeight={480}
      />,
    );

    const scroller = container.querySelector<HTMLDivElement>("div.overflow-auto");
    expect(scroller).not.toBeNull();
    expect(scroller).toHaveStyle({ maxHeight: "480px" });
    expect(scroller!.contains(screen.getByRole("table"))).toBe(true);

    // Only a window of rows is in the DOM — never all 1000.
    const rendered = dataRows();
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    expect(screen.getByText("Person 001")).toBeInTheDocument();
    expect(screen.queryByText("Person 999")).not.toBeInTheDocument();

    // No pagination chrome in virtualized mode.
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("csvColumns treats dotted CSV headers literally and renders — for blanks", () => {
    const data: Row[] = [
      { "contact.email": "dot@example.com", Notes: "" },
      { "contact.email": "", Notes: "hello" },
    ];
    render(<DataTable columns={csvColumns(["contact.email", "Notes"])} data={data} />);

    // accessorFn (not accessorKey) — a dotted header must not be read as a
    // nested path, which would blank out the whole column.
    expect(screen.getByText("dot@example.com")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
