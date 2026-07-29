## Summary

<!-- What does this PR do and why? -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing behavior to change)
- [ ] Documentation only
- [ ] Refactor / chore

## Related issues

<!-- Link issues: Fixes #123, Closes #456 -->

## Testing

<!-- How did you verify this? -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] E2E / manual testing (describe below)

## AI / prompt changes

<!-- If this touches prompts or mapping logic, confirm eval was run -->

- [ ] Not applicable
- [ ] `npm run eval --workspace backend` passed
- [ ] Golden set expectations updated (if intentional behavior change)

## Screenshots / recordings

<!-- UI changes only — optional -->

## Checklist

- [ ] Types crossing the network live in `shared/` (no duplication)
- [ ] Business logic stays in `services/`; controllers remain thin
- [ ] Bug fixes include a regression test
- [ ] Docs updated if behavior changed (`README`, `docs/API.md`, etc.)
