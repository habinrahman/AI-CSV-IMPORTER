# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅        |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security issue, email **genai.microdegree@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Impact assessment (if known)
- Your GitHub username (for attribution, if desired)

You should receive a response within **72 hours**. We will coordinate disclosure and credit fix contributors when appropriate.

## Scope

In scope:

- Prompt injection via CSV content and model output handling
- Upload validation, file storage, and temp-file lifecycle
- Authentication bypass on job/file endpoints (when auth is added)
- Information leakage via error responses or logs
- Dependency vulnerabilities with demonstrable exploit paths

Out of scope:

- Denial of service from intentionally large CSV uploads within the documented 5 MB limit
- Missing authentication on job URLs — capability UUIDs are intentional for the current scope; see README roadmap

## Security practices in this repo

- CSV cells are confined to the user (data) role; instruction roles carry injection guardrails
- All model output is schema-validated and re-normalized by deterministic code
- Helmet, exact-origin CORS, rate limiting, and non-root Docker images
- `npm audit --omit=dev --audit-level=high` in CI
- Dependabot monitors npm dependencies

## Safe harbor

We appreciate responsible disclosure and will not pursue legal action against researchers who follow this policy in good faith.
