# Working Agreement

## Product Scope

- This repository contains fantasy-season-companion-2026, a local-first,
  static GitHub Pages assistant for the 2026 fantasy-football season.
- Core workflows are waiver analysis, lineup decisions, league/opponent
  analysis, and trade evaluation.
- Keep this repository independent from fantasy-war-room-2026. Do not modify,
  replace, or depend on the completed draft repository unless the user
  explicitly requests it.
- The app provides decision support. It must never automatically submit a
  waiver claim, add/drop, lineup change, trade offer/response, or message.
- Prepare actions for review, then require the user's explicit confirmation at
  the final submission step in ESPN or any other service.

## Privacy Boundary

- Application code and licensed public research data may be published. League,
  manager, and authenticated account data are private.
- Never commit, publish, upload, log, or include in build artifacts:
  - credentials, cookies, tokens, session identifiers, or authenticated URLs;
  - private league/team identifiers, manager identities, team names, rosters,
    standings, matchups, transactions, messages, or trade discussions;
  - browser exports or screenshots containing private league information.
- Imported league snapshots stay on the user's device in browser storage.
  Never transmit them to analytics, hosted databases, APIs, telemetry, error
  reporting, service-worker caches, CI logs, or third parties.
- Treat authenticated browser access as temporary observation, not permission
  to persist or publish what is visible.
- Use fictional or irreversibly anonymized fixtures in source and tests.
- Provide clear local export, replacement, and permanent-delete controls.

## Repository and Deployment

- main is the integration and GitHub Pages branch. Start non-trivial changes
  from an up-to-date main and use one focused branch per change.
- The production artifact is a static site built from site/ into dist/.
  GitHub Pages cannot run a Python, Node, or other application server.
- All browser paths must be repository-relative so the app works at
  /fantasy-season-companion-2026/, not only at a domain root.
- Deploy only through a checked-in GitHub Pages workflow or an explicitly
  authorized manual equivalent.
- Use public GitHub Pages and standard GitHub-hosted runners only. Never add a
  paid feed, cloud database, premium runner, billing change, or marketplace
  action without explicit approval.
- Keep workflow permissions least-privileged, actions reviewed, schedules
  bounded with concurrency/timeouts, and public-data refreshes reviewable by PR.
- Never expose secrets through Pages, browser bundles, source maps, logs,
  repository history, or build output.

## League Data and Local State

- Use stable platform/player/team identifiers as keys; names are display data.
- Define and version the private snapshot schema. Validate every import before
  replacing local state and preserve the last valid snapshot on failure.
- Reject malformed, unsupported, unexpectedly large, or internally
  inconsistent imports. Recover gracefully from bad browser storage.
- Keep a deterministic local audit trail for snapshots, recommendations, and
  user actions without storing authentication material.
- Display platform, season, scoring settings, capture time, freshness, and
  missing-data warnings prominently.
- League settings remain editable. Never bake one team count, scoring format,
  roster shape, waiver system, or playoff format into recommendation logic.

## Recommendations and Analysis

- Every recommendation must expose its sources, retrieval timestamps,
  freshness, uncertainty, missing data, and explainable components.
- Keep important component weights visible and user-adjustable where practical.
- Waiver analysis should separate player value, roster fit, replacement cost,
  role trend, schedule, availability, and bid/priority uncertainty.
- Lineup analysis should separate projection, role, health/status observation,
  matchup, floor/upside, and late-swap risk.
- Trade analysis should show both rosters before and after, positional
  replacement value, depth, bye weeks, uncertainty, and short- versus
  rest-of-season impact.
- Never turn an injury label into a diagnosis or guaranteed return date. Never
  present projections, rankings, trades, or waiver outcomes as certain.
- Weather, roof, surface, travel, rest, and historical splits are contextual
  signals. Confidence-weight and cap their combined effect so opportunity,
  projection, roster need, and replacement value remain dominant.

## Public Data and Research

- Store source observations separately from derived scores.
- Every published snapshot needs a source URL, retrieval time,
  terms/attribution note, and freshness state.
- Prefer official NFL/team sources and explicitly reusable public APIs. Do not
  scrape or redistribute private league pages, paywalled content, proprietary
  rankings, or full article text.
- News digests may link to and briefly summarize sources.
- Use bounded retries and request limits. A failed refresh must preserve the
  last known-good snapshot. Isolate optional-source failures and gate advice
  when stale or missing data is material.
- Weather forecasts are credible only near game day. Do not fabricate future
  conditions or label climate normals as a forecast.

## Engineering and Safety

- Avoid runtime dependencies unless they materially improve the product.
- Use safe DOM APIs and event delegation for imported/external data. Never put
  player, team, manager, news, or trade text into inline JavaScript or
  unsanitized HTML.
- Apply schema validation, output encoding, URL allowlists, and defensive size
  limits to imports and external data.
- Do not add analytics, trackers, advertising, or remote error reporting
  without explicit approval.
- Preserve accessibility, keyboard navigation, responsive layouts,
  offline/stale messaging, and the repository subpath.
- Service workers may cache public app assets and public snapshots only. They
  must not cache private imports or authenticated responses.
- Use apply_patch for source and documentation edits. Preserve unrelated user
  changes.

## Required Checks

Once the application scaffold exists, the complete local gate is:

    npm run check

For UI-sensitive work, build and serve dist/, then verify loading at the repo
subpath, mobile/desktop layout, keyboard navigation, import validation,
local-only storage, analysis flows, source/freshness explanations, offline
behavior, and the final-action confirmation boundary.

Before every release, scan the repository, dist/, source maps, console output,
and service-worker caches for private fixture or imported values. Public-data
changes must pass schema, stable-ID, uniqueness, attribution, freshness,
bounds, and last-known-good checks.
