# Privacy Model

## Public

The repository, GitHub Pages bundle, app shell, schemas, documentation, derived
model code, and independently constructed fictional fixture are public.

## Private and Memory-Only

League identifiers, team and manager names, rosters, standings, matchups,
waiver order, transactions, trade discussions, notes, recommendations, and
imported snapshots stay in memory in the current browser tab.

The deployed app does not persist them in localStorage, sessionStorage,
IndexedDB, or Cache Storage. GitHub Pages projects for the same account share a
`github.io` origin, so a repository path is not an adequate storage boundary.
Refreshing or closing the tab clears the data unless the user explicitly
downloads a local export.

## Never Stored

Credentials, cookies, authentication tokens, authorization headers, session
identifiers, browser-profile data, and raw authenticated page responses are
never stored by the app or capture routine.

## No Private Network Path

The app's content security policy sets `connect-src 'none'`. It includes no
analytics, telemetry, advertising, error reporting, cloud database, account
backend, remote font, or third-party runtime asset.

Selecting a snapshot reads the local file through the browser File API. It does
not fetch, upload, beacon, serialize to a URL, or send the contents to a service
worker. Exports create a local Blob download and promptly revoke its temporary
object URL.

## Service Worker

Offline support uses a fixed, versioned allowlist containing only the public
HTML, CSS, JavaScript modules, manifest, icon, and fictional demo module. The
worker:

- has repository-relative scope;
- intercepts only same-origin, query-free GET requests whose full URL is on the
  allowlist;
- refreshes those public assets from the network when available and falls back
  to the cached copy offline;
- never implements generic runtime caching;
- never receives snapshots or recommendations by message; and
- deletes only old caches with this app's own prefix.

## Browser Access

Authenticated Chrome access may be used during a user-requested working session
to read current visible league state. That access does not authorize publishing
the observed data or submitting a transaction.

Any final action that changes a lineup, roster, waiver claim, trade, or message
requires the user's explicit confirmation at that moment. Waiver Lab itself has
no transaction integration.

## Import Safety

- Files larger than 5 MB, unsupported versions, inconsistent counts, duplicate
  IDs, roster/availability conflicts, forbidden authentication fields, and
  prototype-pollution keys are rejected.
- Only documented fields survive normalization.
- Validation completes before current state is replaced.
- A failed import preserves the last valid in-memory snapshot.
- Imported strings render through text nodes and safe attributes, never
  unsanitized HTML.
- Schema v0 is historical-only and cannot produce claim advice.

## Release Enforcement

The production build copies only an exact reviewed asset manifest. The release
gate rejects:

- tracked private/import/export paths;
- symlinks, source maps, or unexpected deployment files;
- unsafe DOM APIs, origin-wide browser storage, or unexpected network APIs;
- authenticated ESPN URL/session patterns; and
- values found in local private snapshots if they appear in public source,
  documentation, build output, or Git history.

The scanner reports paths and counts only, never the matched private value.
Public tests use independent `demo-` identifiers and fictional teams/players.

GitHub Pages cannot set a response-header `frame-ancestors` policy from HTML
metadata. All other applicable CSP controls are enforced in the document.
