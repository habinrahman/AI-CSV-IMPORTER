# GrowEasy Importer — API Reference

Base URL: `http://localhost:4000` locally, or your Railway domain in production.
All request/response types are defined in [`shared/src/api-contracts.ts`](../shared/src/api-contracts.ts)
and consumed by both apps — this document describes the same contract in prose.

## Conventions

- **Error envelope** — every non-2xx response has this shape:

  ```json
  { "error": { "message": "…", "requestId": "uuid", "details": { } } }
  ```

  `requestId` matches the `X-Request-Id` response header and every server log
  line for the request — quote it when reporting a problem. `details` appears
  only for validation errors (field-level messages).

- **Request IDs** — send your own `X-Request-Id` header (URL-safe, ≤64 chars)
  to correlate with an upstream system; otherwise one is generated.

- **Rate limiting** — all endpoints except `/api/health` share a per-IP limit
  (default 100 req/min), reported via standard `RateLimit-*` headers.
  Exceeding it returns `429`.

---

## `GET /api/health`

Liveness probe. Never rate-limited.

**200**

```json
{ "status": "ok", "service": "groweasy-backend", "version": "0.1.0", "timestamp": "…" }
```

---

## `POST /api/upload`

Upload a CSV (multipart form, field name **`file`**). The file is stored
temporarily (default TTL 30 min) and identified by `fileId` in later calls.

```bash
curl -X POST -F "file=@leads.csv;type=text/csv" http://localhost:4000/api/upload
```

**201**

```json
{
  "fileId": "6d3bad57-…",
  "filename": "leads.csv",
  "sizeBytes": 246,
  "uploadedAt": "2026-07-08T…",
  "expiresAt": "2026-07-08T…"
}
```

| Failure | Status |
| --- | --- |
| Not a `.csv` / disallowed MIME | `400` |
| Larger than `MAX_FILE_SIZE_MB` (default 5 MB) | `413` |

---

## `POST /api/parse`

Server-side preview of an uploaded file: cleaned headers, the first N rows,
and an exact total row count — streamed, so file size does not matter.

**Body** — `{ "fileId": "<uuid>", "previewRows": 20 }` (`previewRows` optional, 1–100, default 20)

**200**

```json
{
  "fileId": "…",
  "filename": "leads.csv",
  "headers": ["Full Name", "E-mail Addr", "Phone No", "column_4"],
  "rows": [{ "Full Name": "Ravi Kumar", "…": "…" }],
  "totalRows": 4
}
```

Header cleaning: BOM stripped, whitespace trimmed, blank headers become
`column_N`, duplicates get a ` (2)` suffix.

| Failure | Status |
| --- | --- |
| Invalid body | `400` |
| Unknown / expired `fileId` | `404` |
| File unreadable as CSV | `422` |

---

## `POST /api/imports`

Start the AI import for an uploaded file. Returns immediately — the work
runs in the background.

**Body** — `{ "fileId": "<uuid>" }`

**202**

```json
{ "jobId": "31f6…" }
```

| Failure | Status |
| --- | --- |
| Invalid body | `400` |
| Unknown / expired `fileId` | `404` |
| Too many imports already running (`MAX_CONCURRENT_JOBS`) | `429` |
| AI provider not configured (missing API key) | `503` |

Job lifecycle: `queued → parsing → mapping → completed | failed`.

---

## `DELETE /api/imports/:jobId`

Cancel a running import. The job is marked `failed` with
`"Import was cancelled"` (subscribers receive the terminal `failed` event)
and the pipeline aborts — in-flight provider calls stop immediately.
Idempotent: cancelling a finished job returns its snapshot unchanged.

**200** — the job's `ImportJobSnapshot` after cancellation.

| Failure | Status |
| --- | --- |
| Unknown job | `404` |

---

## `GET /api/imports/:jobId`

Point-in-time job snapshot (polling fallback for clients without SSE).

**200** — an `ImportJobSnapshot`:

```json
{
  "jobId": "…",
  "status": "mapping",
  "progress": {
    "totalRows": 1240, "processedRows": 480, "skippedRows": 12,
    "failedRows": 1, "currentBatch": 24, "totalBatches": 62
  }
}
```

`error` (string) appears when `status = "failed"`; `stats` appears when
`status = "completed"`.

---

## `GET /api/imports/:jobId/events`

**Server-Sent Events** stream of job progress. Emits the current snapshot
immediately on connect (late subscribers still get state), then one event per
update. Heartbeat comments (`:hb`) flow every 15 s; the stream closes itself
after a terminal event.

| Event name | Meaning | Data |
| --- | --- | --- |
| `progress` | job is running | full `ImportJobSnapshot` |
| `done` | job completed | full snapshot incl. `stats` |
| `failed` | job failed | full snapshot incl. `error` |

The failure event is named `failed`, **not** `error`, because `EventSource`
fires a transport-level `"error"` event on disconnects — the two must never
be confusable.

```js
const source = new EventSource(`${API}/api/imports/${jobId}/events`);
source.addEventListener("progress", (e) => render(JSON.parse(e.data)));
source.addEventListener("done", (e) => finish(JSON.parse(e.data)));
source.addEventListener("failed", (e) => fail(JSON.parse(e.data)));
source.onerror = () => fallBackToPolling();
```

---

## `GET /api/imports/:jobId/result`

The full outcome, available once `status = "completed"`.

**200**

```json
{
  "jobId": "…",
  "records":  [ { "rowIndex": 0, "confidence": 0.95,
                  "name": "Ravi Kumar", "email": "ravi@x.com",
                  "mobile": "+919876543210", "status": "GOOD_LEAD_FOLLOW_UP",
                  "data_source": "", "crm_note": "interested" } ],
  "skipped":  [ { "rowIndex": 2, "reason": "…", "raw": { } } ],
  "errors":   [ { "rowIndex": 5, "message": "…", "raw": { } } ],
  "warnings": [ { "rowIndex": 4, "message": "Low mapping confidence (0.40) …" } ],
  "stats": {
    "totalRows": 5, "imported": 3, "skipped": 2, "failed": 0,
    "warnings": 2, "batches": 3, "durationMs": 8412
  }
}
```

**Audit invariant:** `totalRows === imported + skipped + failed` — every
source row is accounted for in exactly one bucket, with its raw data and a
human-readable reason when it did not import. `warnings` is an additional
channel (rows that imported but deserve review), not a bucket.

| Failure | Status |
| --- | --- |
| Job still running | `409` |
| Job failed | `409` (message carries the reason) |
| Unknown job / swept after `JOB_TTL_MINUTES` | `404` |

**With persistence configured** (`DATABASE_URL`), this endpoint and the
snapshot endpoint fall back to the database when the job is no longer in
memory — completed imports remain fetchable across restarts and TTL sweeps.
A job also only reports `completed` after its records were durably written
to the `crm_records` and `failed_records` tables (persistence failure fails
the job explicitly).

---

## CRM record schema

The full GrowEasy CRM record (assignment spec). Only email/mobile decide the
skip rule; every other field is best-effort — extracted when the row carries
it, `""` (or `null` status) when it doesn't.

| Field | Type | Notes |
| --- | --- | --- |
| `created_at` | string | lead creation date, guaranteed `new Date()`-convertible; `""` when absent/unparseable |
| `name` | string | whitespace-normalized; split first/last columns combined |
| `email` | string | lowercased; `""` when absent/invalid |
| `country_code` | string | `"+91"` form, derived by libphonenumber; `""` when no mobile |
| `mobile_without_country_code` | string | national number, digits only; `""` when absent/unparseable |
| `company` | string | company / organization / employer |
| `city` / `state` / `country` | string | location fields; combined cells may fill several |
| `lead_owner` | string | owner / assigned agent, as written |
| `crm_status` | enum \| null | `GOOD_LEAD_FOLLOW_UP` · `DID_NOT_CONNECT` · `BAD_LEAD` · `SALE_DONE`; `null` when the row carries no signal |
| `crm_note` | string | merged remarks + extra contacts + useful unmapped columns (single line — no raw line breaks) |
| `data_source` | enum \| `""` | `leads_on_demand` · `meridian_tower` · `eden_park` · `varah_swamy` · `sarjapur_plots`; `""` unless confidently inferred |
| `possession_time` | string | property possession/handover timing |
| `description` | string | longer requirement text (call remarks stay in `crm_note`) |

Skip rule: a record is skipped **only** when it has neither a valid email nor
a valid mobile after normalization.
