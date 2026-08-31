# Privacy Model

## Public

The repository, GitHub Pages bundle, app shell, public-source observations,
derived public metrics, schemas, and fictional test fixtures may be public.

## Local-Only

League identifiers, team and manager names, rosters, standings, matchups,
waiver order, transactions, trade discussions, notes, and imported snapshots
stay on the user's device. The app must keep these values out of network
requests, URLs, telemetry, logs, source maps, build artifacts, and caches.

## Never Stored

Credentials, cookies, authentication tokens, session identifiers, and raw
authenticated page responses are never persisted by the app.

## Browser Access

Authenticated browser access may be used during a user-requested working
session to read current league state. That access does not authorize publishing
the observed data or submitting a transaction. Any final action that changes a
lineup, roster, waiver claim, trade, or message requires the user's explicit
confirmation at that moment.

## Tests

Tests use synthetic league/team/player fixtures. Release checks must scan
source, build output, caches, and console logs for private values from local
development snapshots.
