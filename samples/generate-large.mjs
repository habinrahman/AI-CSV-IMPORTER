#!/usr/bin/env node
/**
 * Generate a large seed CSV for load/perf testing the import pipeline.
 *
 *   node samples/generate-large.mjs 20000 > samples/leads-large.csv
 *
 * Rows are realistic-but-synthetic: ~80% have contacts (imported), ~10%
 * junk-contact rows (skipped by the pre-filter for free), ~10% carry status
 * or source evidence — so batching, skipping, and inference all get exercised.
 */

const count = Number(process.argv[2] ?? 10_000);
if (!Number.isInteger(count) || count <= 0) {
  console.error("Usage: node samples/generate-large.mjs <rowCount>");
  process.exit(1);
}

const FIRST = [
  "Ravi",
  "Priya",
  "Amit",
  "Sunita",
  "John",
  "Fatima",
  "Deepak",
  "Anjali",
  "Vikram",
  "Rekha",
  "Meena",
  "Arjun",
];
const LAST = [
  "Kumar",
  "Sharma",
  "Patel",
  "Iyer",
  "Mathew",
  "Khan",
  "Rao",
  "Menon",
  "Singh",
  "Nair",
  "Reddy",
  "Verma",
];
const STATUS_PHRASES = [
  "interested - call back",
  "did not pick",
  "switched off",
  "not interested",
  "sale done",
  "wants site visit",
  "RNR",
  "",
];
const SOURCES = [
  "Leads on Demand",
  "Meridian Tower",
  "Eden Park",
  "Varah Swamy",
  "Sarjapur Plots",
  "",
  "",
  "",
];

const pick = (arr, i) => arr[i % arr.length];

process.stdout.write("Customer Name,Email,Primary Mobile,Feedback,Campaign\n");
for (let i = 0; i < count; i++) {
  const name = `${pick(FIRST, i)} ${pick(LAST, i * 7 + 3)}`;
  const junk = i % 10 === 9; // every 10th row has no usable contact → skipped
  const email = junk ? "N/A" : `lead${i}@example.com`;
  const mobile = junk ? "-" : `98${String(10000000 + (i % 89999999)).padStart(8, "0")}`;
  const status = pick(STATUS_PHRASES, i * 3 + 1);
  const source = pick(SOURCES, i * 5 + 2);
  process.stdout.write(`${name},${email},${mobile},${status},${source}\n`);
}
