# Private League Snapshot Schema v1

Schema v1 is the minimum input for waiver analysis. Schema v0 remains a
historical roster summary and must be refreshed rather than guessed forward.

## Required Shape

```json
{
  "schemaVersion": 1,
  "source": {
    "platform": "espn",
    "method": "read-only Chrome DOM capture",
    "capturedAt": "2026-09-02T14:00:00.000Z",
    "isDemo": false,
    "surfaces": [
      { "kind": "roster", "capturedAt": "...", "status": "complete" },
      { "kind": "available", "capturedAt": "...", "status": "complete" },
      { "kind": "waiverOrder", "capturedAt": "...", "status": "complete" },
      { "kind": "leagueSettings", "capturedAt": "...", "status": "complete" }
    ],
    "coverage": {
      "availablePlayers": {
        "complete": false,
        "rowCount": 265,
        "pageCount": 6,
        "strategy": "top-N per position",
        "positions": ["QB", "RB", "WR", "TE", "D/ST", "K"]
      },
      "teams": { "complete": true, "rowCount": 10 }
    }
  },
  "league": {
    "season": 2026,
    "teamCount": 10,
    "scoring": { "format": "full-ppr", "receptionPoints": 1 },
    "roster": {
      "size": 16,
      "starters": { "QB": 1, "RB": 2, "WR": 2, "TE": 1, "FLEX": 1, "D/ST": 1, "K": 1 },
      "bench": 7,
      "ir": 4
    },
    "waivers": {
      "system": "weekly rolling priority",
      "periodDays": 1,
      "order": "inverse standings reset",
      "myPriority": 10,
      "nextResetAt": null
    },
    "tradeDeadline": "2026-12-02"
  },
  "myTeamId": "private-stable-team-key",
  "teams": [],
  "availablePlayers": []
}
```

The values above illustrate shape only. No real league, team, or player value
belongs in this document or any other tracked file.

## Team and Player Records

Each team has a stable `teamId`, display `name`, `isMine`, current
`waiverPriority`, and normalized `players` array. Each rostered player has:

- `playerId`: stable platform ID; for a defense use a stable team key.
- `name`, `nflTeam`, `position`, and current `slot`.
- `status`, `opponent`, and `gameStatus` when visible.
- `weeklyProjection`, `seasonProjection`, `seasonAverage`, `percentStarted`,
  `rosteredPct`, and `rosterChangePct` as finite numbers or `null`.
- `locked`: whether the transaction surface shows the player locked.
- `droppable`: `true`, `false`, or `null` when the capture cannot verify it.
- `eligibleSlots`: captured slot IDs or labels when available.

Available-player records use the same projection fields plus `availability`
(`FA`, `WA`, or the platform label) and omit roster-only fields.

## Validation Rules

- Maximum file size is 5 MB and at most 32 teams / 2,000 available players.
- Team and player IDs must be non-empty and unique.
- A player cannot be both rostered and available.
- Team count, roster bounds, my-team cross-reference, coverage row count,
  timestamps, and allowed positions must agree.
- Every required surface must appear exactly once with a valid timestamp and
  `complete` status. Missing, duplicate, or failed surfaces reject the import.
- Security, ownership, lock, and coverage flags must be real JSON booleans;
  truthy strings are rejected.
- Authentication/session fields and prototype-pollution keys are rejected at
  any depth.
- Unknown fields are discarded during normalization.
- Imported strings are rendered with text nodes, never parsed as HTML.
- A failed import leaves the current in-memory snapshot untouched.

## Confidence and Action Gates

- The oldest required surface controls freshness.
- Up to two hours old is fresh; two to six hours is usable with reduced
  confidence; more than six hours requires refresh; more than 24 hours is
  expired.
- Freshness is recomputed when the tab regains focus and immediately before a
  move can be staged or exported.
- Partial player-pool or league-roster coverage caps confidence at 60.
- Missing weekly projections cap the affected pair at 55.
- Unknown drop eligibility is review-only and cannot receive a claim verdict.
- Waiver players need a valid priority and next-reset time to price priority;
  free agents have zero priority cost.
