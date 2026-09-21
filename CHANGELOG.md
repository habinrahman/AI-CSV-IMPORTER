# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Cross-import email deduplication: when `DATABASE_URL` is set, mapped leads whose
  email already exists in `crm_records` are skipped with an auditable reason.
  Within a single import, the first row for an email wins; later duplicates skip.
  Phone-only leads (empty email) are unaffected.

## [0.1.0] - 2026-07-29

### Added

- Community health files: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`
- GitHub issue/PR templates, Dependabot, and release workflow
- FAQ section, architecture SVG diagram, and deployment guide (`docs/DEPLOY.md`)
- Product demo GIF and refreshed screenshots (`npm run record:demo`)
- Social preview image (`docs/social-preview.png`)
- 17 GitHub topics for discoverability

### Changed

- LICENSE copyright updated to Habin Abdul Rahman
- Contributing section links to dedicated community files

[Unreleased]: https://github.com/habinrahman/AI-CSV-IMPORTER/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/habinrahman/AI-CSV-IMPORTER/releases/tag/v0.1.0
