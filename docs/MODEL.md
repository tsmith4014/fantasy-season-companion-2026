# Explainable Waiver Model

The app ranks transactions, not names. For every available player, it compares
the candidate with verified or reviewable drops on the user's current roster.

## Candidate Components

Default visible weights are:

| Component | Weight | Meaning |
| --- | ---: | --- |
| Rest of season | 34 | Position-relative season projection |
| Next week | 24 | Position-relative upcoming projection |
| Roster need | 18 | Starter quality and depth gap at that position |
| Market demand | 10 | Current rostered percentage |
| Role trend | 8 | Roster movement and projection-vs-average signal |
| Status usability | 6 | Captured availability designation, without diagnosis |

The app rebalances non-zero weights automatically. Users can tune them, but
projection and roster fit are deliberately the dominant default signals.

## Pair Score

For each add/drop pair:

1. Candidate value is the weighted component average, with roster need applied
   as a small additional fit term.
2. Drop cost is that rostered player's comparable value plus a starter/locked
   protection penalty.
3. A QB, TE, defense, or kicker who projects behind a healthy current starter
   receives a bounded backup-redundancy penalty.
4. Adding a second one-starter position while dropping somewhere else receives
   a roster-balance charge; direct upgrades at the same position avoid it.
5. Free agents have no priority cost. Waiver players receive a bounded cost
   based on current priority strength and time remaining before the weekly
   reset.
6. A small churn cost prevents tiny differences from looking actionable.
7. `move score = candidate value - redundancy - roster balance - drop cost - priority cost - churn cost`.

Scores remain unrounded for sorting; the interface rounds only for display.
Exact ties resolve by confidence, stable add ID, then stable drop ID. This makes
results deterministic even when source arrays arrive in a different order.

## Verdicts

- **Strong claim:** move score at least 22 and confidence at least 75.
- **Claim:** move score at least 10 and confidence at least 70.
- **Watch:** move score from 3 through 9.9, or an otherwise interesting move
  whose evidence/legality is not claim-ready.
- **Pass:** move score below 3.
- **Refresh required:** a hard freshness or input gate failed.

These labels are decision support, not outcome predictions.

## Confidence

Confidence combines capture age, projection completeness, available-pool
coverage, stable identifiers, and drop eligibility. Missing data never becomes
a silent zero. A recommendation can remain visible as historical analysis
while its staging control is disabled.

The app recomputes freshness at action time. Tuning weights also reconciles
staged moves with the current model: scores and verdicts update, and moves that
become passes leave the plan.

## Claim Ladders

Moves using the same drop are mutually exclusive and form an ordered
`first_success` ladder. If the first claim succeeds, later alternatives using
that drop cannot process. Moves using different drops stay in independent
groups. The exported plan describes this relationship and still requires the
user to enter and confirm every claim in ESPN.
Pass and refresh-required recommendations cannot enter the plan through either
the visible controls or the optional browser tool surface.

## Limitations

- Imported ESPN projections are estimates, not independent forecasts.
- Roster percentage is market context, not proof of future opportunity.
- Current status labels are observations, not medical advice.
- Pending claims by other managers are not visible.
- Role, depth-chart, schedule, and injury news can change after capture.
- Position-count trade fits are conversation starters, not player valuations.
