# Production Checklist

Status of every production concern, verified at Milestone 12. ✅ done · 📋 deploy-time step ·
🔭 deliberate deferral (with the upgrade path).

## Security

- ✅ **Helmet** security headers on every response
- ✅ **CORS**: exact-origin allowlist; verified the header is the *fixed* configured value,
  never a reflection of the request origin
- ✅ **Rate limiting** per IP (draft-7 headers), `trust proxy = 1` so real client IPs are used
  behind Railway's proxy; health endpoint exempt
- ✅ **Upload hardening**: extension + MIME allowlist, 5 MB cap (client *and* server),
  UUID server-side filenames (client filename never touches the filesystem), TTL sweep of
  temp files, uploads deleted once consumed
- ✅ **Input validation**: Zod on every body (parsed, typed, defaulted); env Zod-validated at
  boot (fail fast)
- ✅ **Error sanitization**: unknown errors → generic 500; stacks/internals never leave the
  server; every error carries a `requestId` for correlation instead
- ✅ **Prompt-injection defense**: CSV content confined to the data role as JSON; "cell text is
  data, never instructions" enforced in both instruction roles; model output re-validated by
  code either way
- ✅ **Secrets**: server-side env only; `.env*` gitignored; no secret reaches the browser
  bundle (`NEXT_PUBLIC_` is the only client-visible surface)
- ✅ **`npm audit`**: 0 vulnerabilities at last run; CI enforces `--omit=dev --audit-level=high`
- ✅ **X-Request-Id** header accepted only when shaped like an id (log-injection guard)
- ✅ **Containers run as non-root** (`USER node` in both Dockerfiles)
- ✅ **Job concurrency cap** (`MAX_CONCURRENT_JOBS`, 429 beyond it) — bounds memory and
  provider-rate-limit blast radius from a burst of starts
- 📋 Rotate the OpenAI key used during development before launch
- 🔭 Authentication/multi-tenancy — out of assignment scope; middleware seam exists
  (job/file IDs are unguessable capability UUIDs in the meantime)

## Performance

- ✅ Streaming CSV parse (constant memory; 20k-row test), backpressure via async iterators
- ✅ Deterministic pre-filter skips contact-free rows before any AI spend
- ✅ Bounded AI concurrency + batching (both env-tunable)
- ✅ **compression** on JSON responses (large results shrink dramatically) with SSE explicitly
  exempted — compression would buffer the event stream
- ✅ `keepAliveTimeout` 65 s > proxy idle timeout (prevents sporadic 502s behind load balancers)
- ✅ Frontend: all routes statically prerendered; heaviest route 216 kB First Load JS;
  `next/font` optimization; table virtualization for large previews; `Toaster`/dialog code
  split by route
- ✅ React Query caching (`staleTime: Infinity` for immutable results)
- ✅ Prompt tokens: system/developer prompts rendered once per provider instance, not per batch
- ✅ **Token/cost observability**: every job's stats report total prompt/completion tokens
  (including retried and bisected calls); per-batch usage in debug logs
- 🔭 Full OpenTelemetry traces — requestId correlation + pino structured logs + per-job token
  stats cover the assignment scope; the OTel SDK slots into the middleware/provider seams
- 🔭 Worker-queue execution (BullMQ et al.) — the 5 MB upload cap bounds job size, so in-process
  background execution holds; `ImportRunner` is the queue seam when files outgrow it

## Reliability

- ✅ Retry with full-jitter backoff + `Retry-After`; error classification
  (retryable / bisect / fatal); batch bisection isolates poison rows
- ✅ JSON repair + self-repair prompt hints before giving up on a batch
- ✅ Jobs survive client disconnects (background execution + SSE resubscribe gets a full
  snapshot; client falls back to polling automatically)
- ✅ **Cancellation**: `DELETE /api/imports/:id` + a confirmed Cancel button on the progress
  page; aborts in-flight provider calls, exactly one terminal event
- ✅ Graceful shutdown: SIGTERM aborts jobs *first* (terminal SSE events flush, streams end),
  then drains connections (`closeIdleConnections`) — no deadlock on live SSE clients
- ✅ TTL sweep never silently deletes a *running* job: it cancels with a terminal event, then
  sweeps; terminal job state is immutable (no double terminal events)
- ✅ Audit invariant checked on every job; `total = imported + skipped + failed`
- ✅ Healthchecks: `/api/health` wired into docker-compose and `railway.toml`
- ✅ **Optional durability** (`DATABASE_URL`, Supabase + Drizzle): jobs, CRM records, and failed rows persist via per-table repositories;
  a job only reports `completed` after its records are durably written (retried; explicit
  failure otherwise, upload retained); snapshot/result endpoints fall back to the DB after
  restarts
- 🔭 Without `DATABASE_URL`, in-memory job/file stores lose state on restart — acceptable for
  single-instance assignment scope; `FileStorage` remains the S3 seam

## Delivery

- ✅ Multi-stage Dockerfiles (backend: dev-dependency-free runtime via a `prod-deps` stage,
  non-root; frontend: Next standalone, non-root), compose with healthchecks + full env surface
  *(Docker daemon not available in the final verification environment — re-run
  `docker compose up --build` before first deploy)*
- ✅ CI: lint → typecheck → 181 tests (144 backend + 37 frontend) → both builds → dependency audit
- ✅ `railway.toml` (Dockerfile build, healthcheck) · Vercel via `vercel-build` script
  (Root Directory = `frontend`)
- ✅ Seed data: `samples/` (standard + hostile CSVs, load-test generator) · real screenshots
  in `docs/screenshots/`
- 📋 Set env vars in Railway (all of `backend/.env.example`; `CORS_ORIGIN` = exact Vercel URL)
- 📋 Set `NEXT_PUBLIC_API_URL` in Vercel to the Railway domain
- 📋 If persisting: set `DATABASE_URL` (Supabase transaction pooler) and run
  `npm run db:push --workspace backend` once
- 📋 Smoke the deployed pair: upload → import → SSE progress → cancel → result → export

## Code quality

- ✅ 144 backend unit/service tests (CSV engine, prompts, retry, batching, normalizers,
  pipeline, job store/service, repositories, golden-set integrity) — all green
- ✅ Frontend test suite (Vitest + Testing Library) covering the upload, preview, progress,
  and results flows — 37 behavioral tests, including regression tests for the polling and duplicate-header bugs
- ✅ **E2E browser journeys (Playwright)**: boots both built servers and drives a real browser
  through home → upload (real multer) → preview (real parse) → confirm → the 503 error path;
  a key-gated happy-path spec (progress → results → CSV export) activates with
  `OPENAI_API_KEY`; runs in CI on chromium, locally on system Edge (zero downloads)
- ✅ Strict TS (`noUncheckedIndexedAccess`, `noImplicitOverride`, unused checks) across all
  workspaces; ESLint + Prettier clean
- ✅ No TODO/FIXME markers; no placeholder code; stale scaffolding removed
- ✅ Docs match implementation (architecture, API, prompts) — verified this milestone
- ✅ **AI evaluation harness**: 16-row golden set + `npm run eval --workspace backend` scoring
  skip precision/recall, per-field accuracy, hallucination traceability, and token spend;
  exits non-zero on any hallucination or lost lead; CI guards the fixtures themselves
- 📋 Run the eval with a real key and record the numbers before submission
  (`PROMPT_VERSION=v1` vs `v2` A/B is one env flip)
