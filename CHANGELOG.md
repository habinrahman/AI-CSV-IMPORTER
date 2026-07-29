# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Community health files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- GitHub issue/PR templates and Dependabot configuration
- FAQ section in README

## [0.1.0] - 2026-07-10

### Added

- AI-powered CSV import pipeline with OpenAI Structured Outputs and Zod validation
- Versioned prompts (`v1` baseline, `v2` active) with header bank and few-shot examples
- Streaming CSV parse, batched AI calls with retry, bisection, and token accounting
- Async import jobs with SSE progress and polling fallback
- Optional Supabase Postgres persistence via Drizzle ORM
- Next.js 15 frontend: upload → preview → progress → result flow
- Golden-set AI evaluation harness (16 rows)
- 185 unit/component tests + Playwright E2E journeys
- Docker Compose, Railway, and Vercel deployment configs
- GitHub Actions CI: lint, typecheck, test, build, audit, E2E

[Unreleased]: https://github.com/habinrahman/AI-CSV-IMPORTER/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/habinrahman/AI-CSV-IMPORTER/releases/tag/v0.1.0
