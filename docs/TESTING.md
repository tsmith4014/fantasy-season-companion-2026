# Testing Guide

## Complete Gate

Run:

```sh
npm run check
```

This runs, in order:

1. JavaScript syntax, unsafe-DOM, no-network, no-origin-storage, CSP, and
   repository-subpath linting.
2. Public fictional schema-v1 validation.
3. Unit tests for freshness, priority cost, missing data, legality, stable
   ordering, fallback groups, import validation, injection canaries, and the
   optional WebMCP contract.
4. A manifest-only production build into `dist/`.
5. A private-data scan over source, docs, workflow, built assets, and Git
   history using any local private snapshot values without printing them.

No command flags are needed. A non-zero exit means the release is blocked.

## Local Production Preview

After the gate passes:

```sh
npm run serve
```

This serves the exact `dist/` output at the GitHub project path on local port
4174. There are no command flags. Stop it with Control-C in its terminal.

Verify on desktop and a narrow mobile viewport:

- Initial fictional recommendations render at the repository subpath.
- Search, position filters, sorting, model weights, and reset work.
- Changing a drop updates the pair score and staged move.
- Same-drop moves form one ordered first-success ladder.
- Plan reorder, remove, clear, and local export work.
- Valid synthetic import replaces state only after review.
- Malformed import leaves the prior state intact.
- More-than-six-hour data disables claim staging.
- Team health, league map, trades, and Data & Privacy views render.
- Markup-like names display literally and execute nothing.
- Closing/reloading clears private data.
- Cache Storage contains only the fixed public asset allowlist.
- Offline reload works after one connected visit.
- No request is made when selecting or using an imported file.

## Deployed Verification

After Pages succeeds, repeat the key flows at the public repository subpath.
Inspect network and cache state with fictional data only. Do not automate a
real private file import without the user's confirmation at that moment.
