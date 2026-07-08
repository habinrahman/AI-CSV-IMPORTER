import { describe, expect, it } from "vitest";
import type { FailedRow, ImportResult, MappedLead } from "@groweasy/shared";
import {
  chunked,
  DrizzleCrmRecordsRepository,
  DrizzleFailedRecordsRepository,
  finalProgress,
  toFailedInsert,
  toRecordInsert,
  type DbExecutor,
} from "./repositories";

const LEAD: MappedLead = {
  rowIndex: 4,
  confidence: 0.92,
  created_at: "2026-05-13 14:20:48",
  name: "Ravi Kumar",
  email: "ravi@x.com",
  country_code: "+91",
  mobile_without_country_code: "9876543210",
  company: "Acme Realty",
  city: "Pune",
  state: "Maharashtra",
  country: "India",
  lead_owner: "priya@groweasy.ai",
  crm_status: "GOOD_LEAD_FOLLOW_UP",
  crm_note: "call back Monday",
  data_source: "eden_park",
  possession_time: "Dec 2026",
  description: "",
};

const FAILURE: FailedRow = {
  rowIndex: 7,
  message: "Batch failed after retries",
  raw: { Name: "x", Phone: "y" },
};

/**
 * Records the executor calls the repositories make — verifies the
 * delete-then-insert idempotency contract and chunking without a database.
 */
function stubExecutor() {
  const calls: string[] = [];
  const executor = {
    calls,
    delete: () => ({
      where: () => {
        calls.push("delete");
        return Promise.resolve();
      },
    }),
    insert: () => ({
      values: (rows: unknown[]) => {
        calls.push(`insert:${rows.length}`);
        return Promise.resolve();
      },
    }),
  };
  return { calls, executor: executor as unknown as DbExecutor };
}

describe("row mappers", () => {
  it("maps a MappedLead onto crm_records column names", () => {
    expect(toRecordInsert("job-1")(LEAD)).toEqual({
      jobId: "job-1",
      rowIndex: 4,
      leadCreatedAt: "2026-05-13 14:20:48",
      name: "Ravi Kumar",
      email: "ravi@x.com",
      countryCode: "+91",
      mobileWithoutCountryCode: "9876543210",
      company: "Acme Realty",
      city: "Pune",
      state: "Maharashtra",
      country: "India",
      leadOwner: "priya@groweasy.ai",
      crmStatus: "GOOD_LEAD_FOLLOW_UP",
      crmNote: "call back Monday",
      dataSource: "eden_park",
      possessionTime: "Dec 2026",
      description: "",
      confidence: 0.92,
    });
  });

  it("maps a FailedRow with its original cells intact", () => {
    expect(toFailedInsert("job-1")(FAILURE)).toEqual({
      jobId: "job-1",
      rowIndex: 7,
      message: "Batch failed after retries",
      raw: { Name: "x", Phone: "y" },
    });
  });

  it("finalProgress derives a terminal progress from the stats", () => {
    const result = {
      stats: {
        totalRows: 10,
        imported: 7,
        skipped: 2,
        failed: 1,
        warnings: 0,
        batches: 3,
        durationMs: 5,
      },
    } as ImportResult;
    expect(finalProgress(result)).toEqual({
      totalRows: 10,
      processedRows: 10,
      skippedRows: 2,
      failedRows: 1,
      currentBatch: 3,
      totalBatches: 3,
    });
  });
});

describe("chunked", () => {
  it("splits on exact boundaries and remainders", () => {
    expect([...chunked([1, 2, 3, 4], 2)]).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect([...chunked([1, 2, 3], 2)]).toEqual([[1, 2], [3]]);
    expect([...chunked([], 2)]).toEqual([]);
  });
});

describe("replaceForJob repositories", () => {
  it("crm_records: deletes first, then inserts in bounded chunks", async () => {
    const { calls, executor } = stubExecutor();
    const records = Array.from({ length: 2_500 }, (_, i) => ({ ...LEAD, rowIndex: i }));

    await new DrizzleCrmRecordsRepository(executor).replaceForJob("job-1", records);

    expect(calls).toEqual(["delete", "insert:1000", "insert:1000", "insert:500"]);
  });

  it("failed_records: an empty failure list still clears stale rows", async () => {
    const { calls, executor } = stubExecutor();

    await new DrizzleFailedRecordsRepository(executor).replaceForJob("job-1", []);

    // Idempotency: a retry that now has zero failures must erase old ones.
    expect(calls).toEqual(["delete"]);
  });
});
