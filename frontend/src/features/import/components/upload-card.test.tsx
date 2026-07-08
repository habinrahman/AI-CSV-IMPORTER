import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_UPLOAD_MB, UploadCard } from "./upload-card";

function csvFile(name = "leads.csv", content = "Name,Email\na,b\n"): File {
  return new File([content], name, { type: "text/csv" });
}

/** A File whose reported size exceeds the limit without allocating it. */
function oversizedCsv(): File {
  const file = csvFile("big.csv");
  Object.defineProperty(file, "size", {
    value: (DEFAULT_MAX_UPLOAD_MB + 1) * 1024 * 1024,
  });
  return file;
}

/**
 * Dropzone keeps its file input visually hidden and unlabeled, so tests reach
 * it directly. fireEvent.change (not userEvent.upload) is deliberate: it
 * bypasses userEvent's own `accept` pre-filtering so the component's real
 * validation path is what rejects bad files.
 */
function dropFile(container: HTMLElement, file: File): void {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Dropzone file input not found");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("UploadCard", () => {
  it("renders the idle dropzone with the size hint", () => {
    render(<UploadCard file={null} onFileSelected={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Upload a CSV file" })).toBeInTheDocument();
    expect(screen.getByText("Drag a CSV here, or click to browse")).toBeInTheDocument();
    expect(
      screen.getByText(`One .csv file, up to ${DEFAULT_MAX_UPLOAD_MB} MB — any column layout`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects an oversized file with a size error and never passes it upward", async () => {
    const onFileSelected = vi.fn();
    const { container } = render(<UploadCard file={null} onFileSelected={onFileSelected} />);

    dropFile(container, oversizedCsv());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`File is larger than the ${DEFAULT_MAX_UPLOAD_MB} MB limit.`);
    // The selection is cleared, never forwarded.
    expect(onFileSelected).toHaveBeenCalledWith(null);
    expect(onFileSelected).not.toHaveBeenCalledWith(expect.any(File));
  });

  it("rejects a non-CSV file with a type error", async () => {
    const onFileSelected = vi.fn();
    const { container } = render(<UploadCard file={null} onFileSelected={onFileSelected} />);

    dropFile(container, new File(["hello"], "notes.txt", { type: "text/plain" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Only .csv files are accepted.");
    expect(onFileSelected).not.toHaveBeenCalledWith(expect.any(File));
  });

  it("accepts a valid small .csv and forwards it", async () => {
    const onFileSelected = vi.fn();
    const file = csvFile();
    const { container } = render(<UploadCard file={null} onFileSelected={onFileSelected} />);

    dropFile(container, file);

    await waitFor(() => {
      expect(onFileSelected).toHaveBeenCalledWith(file);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a valid selection clears a previous validation error", async () => {
    const onFileSelected = vi.fn();
    const { container } = render(<UploadCard file={null} onFileSelected={onFileSelected} />);

    dropFile(container, oversizedCsv());
    await screen.findByRole("alert");

    dropFile(container, csvFile());
    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("shows the selected file with its name, size, and a remove button", async () => {
    const user = userEvent.setup();
    const onFileSelected = vi.fn();
    const file = csvFile("contacts.csv", "x".repeat(2048));
    render(<UploadCard file={file} onFileSelected={onFileSelected} />);

    expect(screen.getByText("contacts.csv")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove contacts.csv" }));
    expect(onFileSelected).toHaveBeenCalledWith(null);
  });

  it("renders an accessible progressbar while uploading and locks removal", () => {
    const file = csvFile("contacts.csv");
    render(<UploadCard file={file} onFileSelected={vi.fn()} uploading progress={42} />);

    expect(screen.getByRole("progressbar", { name: "Upload progress" })).toBeInTheDocument();
    expect(screen.getByText("Uploading… 42%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove contacts.csv" })).toBeDisabled();
  });
});
