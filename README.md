# Waiver Lab · 2026 Fantasy Season Companion

A private, explainable in-season fantasy football assistant centered on waiver
add/drop decisions. The app compares available players with the actual cost of
each drop, builds ordered fallback ladders, maps roster strengths across the
league, and highlights trade fits.

This repository is deliberately separate from the completed 2026 draft app.
Nothing here depends on or changes that draft repository.

## Live App

GitHub Pages serves the public app shell at:

<https://tsmith4014.github.io/fantasy-season-companion-2026/>

The site opens with fictional demo data. Import a fresh private schema-v1
snapshot to analyze the real league. No private league data is built into the
site.

## What the App Does

- Makes **Waivers** the default workspace.
- Ranks legal or reviewable **add + drop pairs**, not free agents in isolation.
- Shows move score, confidence, component scores, drop cost, priority cost,
  rationale, and reversal conditions.
- Groups moves using the same drop into a **first-success fallback ladder**.
- Hard-gates claim-ready advice when required data is older than six hours.
- Summarizes roster status, positional depth, league roster shapes, and
  complementary trade partners.
- Exports a local review plan but never submits a claim, drop, trade, lineup
  change, or message.

## Private ESPN Data

GitHub Pages cannot and should not sign in to ESPN. The refresh loop is:

1. Open the signed-in league in Chrome.
2. Ask Codex to run the documented read-only capture routine.
3. Validate the generated schema-v1 JSON under ignored `.private/`.
4. Import that file into the app and review the summary before replacing the
   current tab state.
5. Recheck availability and personally confirm any final action in ESPN.

See [the capture runbook](docs/ESPN_CAPTURE_RUNBOOK.md) and
[snapshot schema](docs/SNAPSHOT_SCHEMA.md).

## Privacy Boundary

The deployed app keeps imported league data only in the open tab’s memory. It
does not use localStorage, sessionStorage, IndexedDB, analytics, telemetry, a
hosted database, or remote APIs. This matters because GitHub Pages projects
under one `github.io` hostname share a browser origin.

Refreshing or closing the tab clears the imported data unless you first export
a local copy. The service worker caches only a fixed allowlist of public app
files and fictional demo data.

Private files are ignored and the release gate scans source, build output, and
Git history for values found in local snapshots. See
[the privacy model](docs/PRIVACY.md).

## Development

Requires Node.js 20.11 or newer. There are no runtime dependencies.

```sh
npm ci
npm run check
npm run serve
```

- `npm ci` verifies the exact lockfile state.
- `npm run check` runs syntax/safety linting, schema validation, unit tests,
  the production build, and the private-data leak scan.
- `npm run serve` serves `dist/` at the real repository subpath:
  `http://127.0.0.1:4174/fantasy-season-companion-2026/`.

The complete test and release steps are in [docs/TESTING.md](docs/TESTING.md)
and [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Recommendation Contract

Each result contains:

- **Verdict:** strong claim, claim, watch, pass, or refresh required.
- **Why:** the dominant projection, roster-need, role, market, and status
  components.
- **Evidence state:** capture age, pool coverage, and missing-input warnings.
- **Reversal conditions:** the role, health label, availability, or drop
  change that should trigger another review.

The score is decision support, not certainty. Injury/status labels are
observations, not medical advice. See [docs/MODEL.md](docs/MODEL.md).

## Documents

- [Working agreement](AGENTS.md)
- [Product brief](docs/PRODUCT_BRIEF.md)
- [Snapshot schema](docs/SNAPSHOT_SCHEMA.md)
- [Waiver model](docs/MODEL.md)
- [ESPN capture runbook](docs/ESPN_CAPTURE_RUNBOOK.md)
- [Privacy model](docs/PRIVACY.md)
- [Testing guide](docs/TESTING.md)
- [Operations and Pages release](docs/OPERATIONS.md)

## License

MIT. This is a personal, non-commercial decision-support tool.
