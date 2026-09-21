import { describe, expect, it } from "vitest";
import { isAcceptableCsvUpload } from "./upload.validator";

describe("isAcceptableCsvUpload", () => {
  it("accepts a .csv file with a known CSV MIME type", () => {
    expect(isAcceptableCsvUpload({ originalname: "leads.csv", mimetype: "text/csv" })).toBe(true);
    expect(
      isAcceptableCsvUpload({ originalname: "LEADS.CSV", mimetype: "application/vnd.ms-excel" }),
    ).toBe(true);
    expect(
      isAcceptableCsvUpload({ originalname: "export.csv", mimetype: "application/octet-stream" }),
    ).toBe(true);
  });

  it("rejects a non-csv extension even when the MIME type is on the allowlist", () => {
    expect(isAcceptableCsvUpload({ originalname: "leads.xlsx", mimetype: "text/csv" })).toBe(false);
    expect(isAcceptableCsvUpload({ originalname: "leads.csv.exe", mimetype: "text/csv" })).toBe(
      false,
    );
    expect(isAcceptableCsvUpload({ originalname: "leads", mimetype: "text/csv" })).toBe(false);
  });

  it("rejects a .csv file whose MIME type is not on the allowlist", () => {
    expect(isAcceptableCsvUpload({ originalname: "leads.csv", mimetype: "application/json" })).toBe(
      false,
    );
    expect(isAcceptableCsvUpload({ originalname: "leads.csv", mimetype: "image/png" })).toBe(false);
  });
});
