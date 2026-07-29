# Contributing to GrowEasy Importer

Thank you for your interest in contributing. This project treats AI output as **best-effort input** — the same discipline applies to contributions: clear intent, tested changes, and no silent data loss.

## Quick start

```bash
git clone https://github.com/habinrahman/AI-CSV-IMPORTER.git
cd AI-CSV-IMPORTER
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
npm run dev   # http://localhost:3000 · API :4000
```

Node **≥ 20** (see `.nvmrc`). No `OPENAI_API_KEY` is required unless you are working on the AI import path — uploads and previews work without it.

## Before you open a PR

Run the same gates CI enforces:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For AI or prompt changes, also run:

```bash
npm run eval --workspace backend   # requires OPENAI_API_KEY
```

## Architecture invariants

Keep these rules — they exist so the codebase stays navigable:

1. **Shared contracts** — Types and Zod schemas that cross the network live in `shared/`. Never duplicate them in backend or frontend.
2. **Thin controllers** — Business logic belongs in `services/`. Controllers adapt HTTP only.
3. **AI behind an interface** — Only `services/ai/provider/` may import an AI SDK. The pipeline depends on `AIProvider`.
4. **Immutable shipped prompts** — Do not edit `prompts/v1` or `prompts/v2` in place. Copy-on-write: create `prompts/v3/`, extend the `PROMPT_VERSION` enum, run eval, then switch the default.
5. **Schema ripple** — CRM field changes start in `shared/src/crm.ts`, then follow the compiler: wire schema → prompts → normalizers → Drizzle schema + `db:generate` → frontend → golden set.

## Pull request guidelines

- Branch from `main` using `feat/…`, `fix/…`, or `docs/…`.
- Describe **why** the change is needed, not only what changed.
- Link related issues when applicable.
- Include tests for bug fixes — a regression without a test is incomplete.
- For behavior changes, update the relevant doc (`docs/API.md`, `docs/PROMPTS.md`, or README).

## Reporting issues

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml) for defects and the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml) for enhancements. Include:

- Steps to reproduce (for bugs)
- Sample CSV if the issue involves parsing or mapping
- Node version and whether `DATABASE_URL` was set

## Security

Do **not** open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful and constructive.

## Questions

Open a [Discussion](https://github.com/habinrahman/AI-CSV-IMPORTER/discussions) for design questions, or an issue for concrete bugs and features.
