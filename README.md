# GrowEasy Importer

An AI-powered CSV importer: drop **any** lead CSV — messy headers, mixed formats, no fixed
column names — and get clean, normalized, auditable **GrowEasy CRM** records back.

**Upload → Preview → Confirm → Live progress → Reviewable result → Export.**

![Home page](docs/screenshots/home.png)

![Upload step](docs/screenshots/upload.png)

## What the AI pipeline actually does

- **Semantic column mapping** — headers are hints, never contracts. `"e-mail addr"`,
  `"Correo"`, or an unlabeled column full of `x@y.com` values all resolve to `email`.
- **Normalization in code, not vibes** — emails lowercased and validated; phones split into
  `country_code` + `mobile_without_country_code` via libphonenumber (default region
  configurable, existing country codes always win); `created_at` guaranteed
  `new Date()`-convertible; whitespace collapsed. Invalid values are **discarded with
  warnings, never "fixed"**.
- **Status & source inference with guardrails** — `status` only from the fixed enum with
  evidence tables ("switched off" → `DID_NOT_CONNECT`), `null` when unsure; `data_source`
  only on a confident match, `""` otherwise. The model is never allowed to guess.
- **`crm_note` merging** — remarks, extra emails/phones, and useful unmapped columns are
  merged in a stable order, traceable to the source row. No hallucination by construction:
  strict Structured Outputs + Zod re-validation + row-coverage checks.
- **Skip rule** — a row is skipped only when it has *neither* an email *nor* a mobile, enforced
  twice: a free deterministic pre-filter before any AI call, and an authoritative post-AI check.
- **Resilience** — configurable batches, bounded concurrency, full-jitter exponential backoff
  honoring `Retry-After`, JSON repair, self-repair prompts on validation failures, and batch
  **bisection** so one poison row costs itself, not its neighbors.
- **Audit invariant** — `totalRows = imported + skipped + failed`, every excluded row carries
  its reason and original data, and low-confidence rows are flagged for human review.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui, TanStack Query + Table + Virtual, React Dropzone, PapaParse, Framer Motion, sonner |
| Backend | Node.js, Express, TypeScript, Multer, csv-parser (streaming), OpenAI SDK (Structured Outputs), Zod, libphonenumber-js, Pino, Helmet, CORS, rate limiting, compression |
| Persistence | Supabase (Postgres) via **Drizzle ORM** — optional: jobs + imported CRM records are durable when `DATABASE_URL` is set, in-memory otherwise |
| Shared | `@groweasy/shared` — Zod CRM schema + API contracts consumed by both apps |
| Quality | Vitest (**181 tests**: 144 backend + 37 frontend), **Playwright E2E** journeys against the real stack, AI eval harness (`npm run eval`), ESLint flat config, Prettier, strict TS everywhere, GitHub Actions CI |
| Delivery | Docker + docker-compose, Railway (API), Vercel (web) |

## Quickstart

Requires **Node.js ≥ 20** (see `.nvmrc`). No global tooling needed.

```bash
npm install

# Configure — the only required secret is the OpenAI key (imports return a
# clear 503 without it; upload & preview work regardless).
cp backend/.env.example backend/.env      # → set OPENAI_API_KEY
cp frontend/.env.example frontend/.env.local

npm run dev
```

- Web app → http://localhost:3000
- API health → http://localhost:4000/api/health

Then upload a CSV — any lead export works. Rows without contact info are skipped with reasons;
everything is reviewable before you export.

**No CSV handy?** Use the seed files in [`samples/`](samples/README.md):
`leads-standard.csv` (a typical export), `leads-messy.csv` (synonym headers,
split names, a lying `Email` column, an injection attempt), or generate a
20k-row load-test file with `node samples/generate-large.mjs 20000 > samples/leads-large.csv`.

### Docker

```bash
OPENAI_API_KEY=sk-... docker compose up --build
```

Both images are multi-stage (pruned runtime, Next standalone output) with healthchecks.

## Scripts (repo root)

| Script | Description |
| --- | --- |
| `npm run dev` | Build `shared`, then backend + frontend in watch mode |
| `npm run build` | Build all workspaces in dependency order |
| `npm run test` | Run the Vitest suites (144 backend + 37 frontend) |
| `npm run test:e2e --workspace frontend` | Playwright browser journeys against the built, running stack (add `OPENAI_API_KEY` for the full happy path) |
| `npm run eval --workspace backend` | Score the live model against the golden set (needs `OPENAI_API_KEY`) |
| `npm run lint` / `typecheck` / `format` | Quality gates across all workspaces |

Target one workspace with `--workspace backend|frontend|shared`.

## Environment variables

Backend (`backend/.env` — all optional except the AI key when importing):

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | **Required to run imports** (`503` otherwise) |
| `AI_PROVIDER` | `openai` | Provider switch (adapter pattern; `gemini`/`claude` are add-an-adapter away) |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model for the OpenAI adapter |
| `BATCH_SIZE` / `AI_CONCURRENCY` | `20` / `2` | Rows per AI call / parallel calls |
| `MAX_RETRIES` / `AI_TIMEOUT_MS` | `3` / `60000` | Retry budget / per-request timeout |
| `MAX_CONCURRENT_JOBS` | `4` | Simultaneous import jobs (excess starts get `429`) |
| `PROMPT_VERSION` | `v2` | Versioned prompt module, `v1` \| `v2` (see `docs/PROMPTS.md`) |
| `DEFAULT_PHONE_REGION` | `IN` | Region for phones without a country code |
| `MAX_FILE_SIZE_MB` | `5` | Upload cap (enforced client + server) |
| `UPLOAD_TTL_MINUTES` / `JOB_TTL_MINUTES` | `30` / `60` | Temp-file / finished-job retention |
| `DATABASE_URL` | — | Supabase Postgres (transaction-pooler URL). Optional: enables durable jobs + CRM records via Drizzle |
| `CORS_ORIGIN` | `http://localhost:3000` | Exact allowed browser origin |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `100` | Per-IP rate limit |
| `PORT` / `LOG_LEVEL` / `NODE_ENV` / `UPLOAD_DIR` | sane defaults | Runtime plumbing |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`,
baked at build time).

## Persistence (Supabase + Drizzle)

Set `DATABASE_URL` to your Supabase **transaction-pooler** connection string
(port 6543), then apply the schema once:

```bash
npm run db:push --workspace backend      # or db:generate + db:migrate for SQL-file migrations
```

What it buys you (all optional — everything works in-memory without it):

- **`import_jobs`** — every run's status, progress, and full result document.
  `GET /api/imports/:id` and `/result` fall back to the database, so finished
  imports survive server restarts and the TTL sweep.
- **`crm_records`** — the imported records as queryable, normalized rows (the
  CRM destination) — and **`failed_records`** — per-row failures with their
  original cells, ready for triage/re-import. Both written in one transaction
  with the job row, idempotently (a retried write can never duplicate),
  through per-table repositories (`ImportJobsRepository` /
  `CrmRecordsRepository` / `FailedRecordsRepository`).
- **Durability gate** — a job only reports `completed` after its records are
  persisted (retried on transient failures; a dead database fails the job
  with an explicit reason and keeps the upload for a retry).
- Live progress stays on SSE; the database sees lifecycle transitions, not
  per-batch ticks.

## Deployment

**Backend → Railway.** `railway.toml` is included: point a Railway service at this repo — it
builds `backend/Dockerfile` and health-checks `/api/health`. Set the backend env vars in the
dashboard; `CORS_ORIGIN` must be your exact Vercel URL.

**Frontend → Vercel.** Import the repo, set **Root Directory = `frontend`** (framework:
Next.js). The `vercel-build` script builds `@groweasy/shared` first automatically. Set
`NEXT_PUBLIC_API_URL` to your Railway domain.

**CI.** `.github/workflows/ci.yml` runs lint → typecheck → tests → both builds → production
dependency audit on every push/PR.

## Documentation

| Doc | Contents |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, data flow, sequence diagrams, retry/error strategy, decision log, scalability path |
| [`docs/API.md`](docs/API.md) | Every endpoint with examples, the SSE contract, error envelope |
| [`docs/PROMPTS.md`](docs/PROMPTS.md) | Prompt engineering: roles, few-shots, edge cases, testing & versioning strategy |
| [`docs/PRODUCTION-CHECKLIST.md`](docs/PRODUCTION-CHECKLIST.md) | Security/performance audit results and launch checklist |

## Repository structure

```
├─ samples/           Seed CSVs (standard + hostile) and a load-test generator
├─ frontend/          Next.js app — UI only (features/import, components, hooks)
├─ backend/           Express API — layered: routes → controllers → services
│  └─ src/
│     ├─ prompts/     versioned AI prompt modules (v1 baseline, v2 semantic-mapping — active)
│     └─ services/    csv (streaming) · ai (provider adapter, batching, retry)
│                     · normalize · import (pipeline, jobs) · files · jobs (store+SSE)
├─ shared/            @groweasy/shared — CRM Zod schema + API contracts (single source of truth)
├─ docs/              architecture, API, prompts, production checklist
└─ .github/workflows/ CI
```

## Architecture highlights

- **Provider adapter** — nothing outside `services/ai/provider/` may import an AI SDK.
  Switching vendors is one env change; the pipeline is tested offline against fakes.
- **Prompts are code** — versioned modules with enum values rendered from the shared schema
  (prompt and validator cannot drift), few-shot examples validated by unit tests.
- **Jobs + SSE** — imports run as background jobs with live Server-Sent-Events progress
  (named `progress`/`done`/`failed`), an automatic polling fallback in the client, a
  concurrency cap, and cancellation (`DELETE /api/imports/:id`).
- **Interfaces as seams** — `JobStore`, `FileStorage`, `CsvParser`, `AIProvider`,
  `ImportRunner`: the in-memory implementations swap to Redis/S3/queues without call-site
  changes (see the scalability section of the architecture doc).
- **Measured, not vibes** — every job's stats include total AI token spend (retries and
  bisection included), and `npm run eval --workspace backend` scores the live model against
  a hand-verified golden set: skip precision/recall, per-field accuracy, and a hallucination
  traceability check that fails the run on any invented contact (see `docs/PROMPTS.md` §6).
