# Operations and GitHub Pages

## Branch and Release Flow

- `main` is the production integration branch.
- Use a focused `codex/` branch for non-trivial changes.
- Pull requests run `.github/workflows/ci.yml` with `contents: read` only.
- A push to `main` builds and scans `dist/`, then the deployment job alone gets
  `pages: write` and `id-token: write`.
- Actions use reviewed immutable commit SHAs, `ubuntu-slim`, Node 24, bounded
  timeouts, and no dependency cache or long-lived artifact.

The Pages repository setting must use **GitHub Actions** as its source. The
one-time CLI equivalent is:

```sh
gh api --method POST repos/tsmith4014/fantasy-season-companion-2026/pages -f build_type=workflow
```

This creates the Pages configuration for the repository. `--method POST`
selects the create operation, and `-f build_type=workflow` sends the form field
that chooses the checked-in Actions workflow. Run it only once; a later 409
usually means Pages is already configured.

## Release Checks

1. Run `npm run check` locally.
2. Confirm `.private/` is ignored and no private file is staged.
3. Confirm the separate draft repository is clean.
4. Commit the focused branch, push it, and merge only after CI succeeds.
5. Watch the Pages workflow to completion.
6. Require HTTP 200 for the base path and every fixed public asset.
7. Use fictional data for deployed browser testing, including offline cache
   inspection and a no-network import canary.
8. Verify the `github-pages` environment deployment policy targets `main`.

## Rollback

Because Pages deploys immutable Git commits, revert the bad change on `main`
and let the workflow publish the last known-good source. Do not upload a manual
workspace artifact or bypass the privacy gate.

## Private Snapshot Operations

- Capture is user-triggered in authenticated Chrome and never runs in CI.
- A failed refresh leaves the prior ignored snapshot intact.
- Keep private files out of Git, build output, logs, screenshots, URLs, and
  issue/PR text.
- The deployed app stores imported data in tab memory only; export before
  refresh if a local copy is needed.
- Never put ESPN credentials or league snapshots in Actions secrets.

## Cost Boundary

This project uses public GitHub Pages, standard GitHub-hosted runners, and no
paid API, database, analytics service, premium runner, or marketplace action.
