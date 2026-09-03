# Read-Only ESPN Capture Runbook

This is the repeatable bridge between an authenticated private league and the
public static app. It is intentionally user-triggered: GitHub Pages never signs
in to ESPN and the repository never stores authenticated responses.

## Before Capture

1. Open the correct ESPN fantasy football league and 2026 season in Chrome.
2. Confirm the visible team name and league size before reading any data.
3. Keep the league settings, My Team, Add Players, and league roster pages
   reachable in the signed-in session.
4. Ask Codex to “refresh my private schema-v1 ESPN snapshot for Waiver Lab.”

Codex should name the Chrome session, use visible semantic DOM only, and avoid
cookies, local storage, request headers, raw HTML dumps, or profile data.

## Capture Surfaces

Capture and timestamp each surface independently:

- League settings: season, scoring, roster slots, waiver method/period/order,
  acquisition limit, trade deadline, and team count.
- My Team: stable player ID, slot, name, NFL team, position, status,
  projections, and visible lock/drop eligibility.
- League rosters: every team ID/name, waiver priority, and every rostered
  player's stable ID and position.
- Add Players: all available pages when feasible. If a bounded top-N strategy
  is used, record exact positions, page/row counts, sort order, and
  `complete: false`.
- Waiver order/transactions: current priority and visible next processing or
  reset time when available.

Player-name extraction must target the player anchor inside the athlete column,
not broad row text that may return status labels. Stable numeric ESPN IDs are
preferred; defenses use a stable team key; a composite fallback is allowed
only when clearly labeled and treated with lower confidence.

## Validate Before Replacement

Write the result only beneath ignored `.private/league-snapshots/` with a UTC
capture timestamp in the filename. Use restrictive local file permissions when
practical.

Validate a candidate file with:

```sh
npm run snapshot:validate -- .private/league-snapshots/<file>.json
```

The `--` ends npm's own option parsing so the private filename is passed to the
validator. The validator reports counts only; it does not print names or IDs.
If validation fails, preserve the last known-good snapshot.

Also confirm the private path is ignored:

```sh
git check-ignore .private/league-snapshots/<file>.json
```

`git check-ignore` explains whether Git's ignore rules cover the exact file;
there are no non-obvious flags in this command.

## Import and Act

1. In Waiver Lab, choose **Import league snapshot** and select the validated
   file.
2. Review team, roster, available-player, capture-time, and warning counts.
3. Confirm the import. Data remains in the current tab's memory only.
4. Build claim ladders, export a review plan if useful, and re-open ESPN.
5. Verify that each add is still available and each drop is allowed.
6. Personally enter and confirm the final claims. The app never submits them.

## Known Limits

- ESPN DOM structure can change; semantic headers and row counts must fail
  closed rather than silently producing partial data.
- Other managers' pending claims are private and unknowable.
- A full player pool may span many pages. Partial captures must be labeled and
  will cap confidence.
- A browser-authenticated session can expire mid-run. Never mix values from two
  leagues or seasons.
- Refresh within six hours of planning and again near processing if meaningful
  news or roster movement occurs.
