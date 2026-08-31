# Product Brief

## Goal

Turn a private 2026 fantasy league snapshot plus attributable public football
data into clear weekly decisions without publishing the league or handing
transaction authority to the app.

## Primary Questions

1. What changed since the last snapshot, and which changes matter now?
2. Which available players improve the roster after accounting for the drop?
3. Who should start this week, and what evidence could change that answer?
4. Where is each league roster strong, thin, or exposed?
5. Which trades improve both teams enough to be plausible?

## First User Journey

1. Import or refresh a private league snapshot.
2. Review capture time, league settings, validation results, and missing data.
3. Open Team Health for strengths, risks, and monitoring priorities.
4. Compare a waiver, lineup, or trade scenario with the baseline roster.
5. Save the reasoning locally and review a proposed action.
6. If desired, open the fantasy platform and personally confirm the final step.

## Recommendation Contract

Every result answers four things:

- **Verdict:** the current lean, expressed with uncertainty.
- **Why:** the few components that materially drive it.
- **Evidence:** sources, observation times, and freshness.
- **Reversal conditions:** the news, status, role, price, or roster change that
  would change the lean.

A single opaque score is never sufficient. Component values and weights remain
visible, and the user can inspect both sides of a trade or add/drop pair.

## Initial Modules

- **Snapshot:** validation, local persistence, history, export, and deletion.
- **Team Health:** depth, concentration, handcuffs, bye weeks, injury/status,
  replacement levels, and roster construction.
- **Waivers:** candidate pool, add/drop pairs, priority/FAAB context, and watch
  list.
- **Lineup:** weekly head-to-head comparisons and late-swap alerts.
- **League Map:** positional strength, surplus, need, and opponent schedule.
- **Trades:** plausible partners, before/after depth, rest-of-season impact, and
  negotiation notes kept locally.
- **Sources:** attribution, timestamps, freshness policy, and data-quality gates.

## Non-Goals for the First Release

- Automatic ESPN transactions, offers, acceptances, or messages.
- A hosted account, cloud database, shared league room, or remote telemetry.
- Copying proprietary rankings or private authenticated league pages into Git.
- Treating a projection, injury tag, or model result as certainty.

## Success Criteria

- Private league values never appear in Git, dist/, URLs, service-worker
  caches, console output, analytics, or network requests.
- A snapshot can be imported, validated, replaced, exported, and deleted
  without leaving the browser.
- Each decision shows timestamps, freshness, uncertainty, components, and
  reversal conditions.
- The deployed app works at the repository subpath on mobile and desktop, with
  keyboard navigation and useful offline/stale states.
