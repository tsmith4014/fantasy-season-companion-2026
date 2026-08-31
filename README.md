# 2026 Fantasy Season Companion

A local-first, explainable in-season assistant for waivers, lineup decisions,
league/opponent analysis, and trades.

This is a separate successor to the completed draft-day app. The draft repo
stays intact; this project starts with a clean product and privacy boundary for
the regular season.

## Status

Repository foundation created. The next milestone is a static GitHub Pages app
that imports a validated league snapshot into browser-local storage and turns
it into transparent, source-stamped decision support.

## Privacy and Action Boundary

- Public app code; private league and manager data.
- League snapshots remain on the user's device and are never committed or
  uploaded by the app.
- Credentials, cookies, and authenticated ESPN responses are never stored.
- The app never automatically submits a transaction or message.
- The user reviews and confirms every add/drop, waiver, lineup, and trade action.

See [docs/PRIVACY.md](docs/PRIVACY.md) and [AGENTS.md](AGENTS.md) for the full
working agreement.

## Planned First Release

- A private, versioned league-snapshot import.
- Team health: strengths, fragile positions, depth, bye-week pressure, and
  injury/status monitoring.
- Waiver workspace: available-player fit, replacement value, and priority/FAAB
  planning.
- Lineup decisions with projection, role, matchup, floor/upside, and late-swap
  context shown separately.
- League map and trade finder that explain needs and surplus on both sides.
- Source timestamps, freshness labels, uncertainty, and a deterministic local
  decision log.

## Architecture Direction

The production app will be a static client-side site built from site/ into
dist/. GitHub Pages will host only public code and public-source snapshots.
Private imports will be validated and stored locally in the browser; there is
no hosted database or account backend.

All deployed paths must work beneath:

    /fantasy-season-companion-2026/

## Product Documents

- [Product brief](docs/PRODUCT_BRIEF.md)
- [Privacy model](docs/PRIVACY.md)

Planned documents include the snapshot schema, recommendation model, public
data-source register, testing guide, and operating runbook.

## Development

The executable scaffold and its commands will land in the next implementation
milestone. Once present, npm run check is the required local gate.

## Disclaimer

Fantasy recommendations are uncertain decision support. Projections, injury
reports, depth charts, transactions, and player availability can change. Review
current league state and approve every action yourself.
