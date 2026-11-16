# District Line first-login loading fix

## Root cause

On startup with no saved session, session verification calls `clearAuthState()`, which set `tripsLoading` to `false`. After a successful login, the app published the authenticated state before the Home trip bootstrap effect ran. That created a brief render with an empty trip list and loading already finished, so Home could show the no-bus state and **Add bus section** before `/api/trips` confirmed the result. A slow initial request made the flash easier to see.

The Dashboard already loads its independent primary dashboard, financial ledger and trip filter requests concurrently. It had loading flags, but its initial page loading lacked a clear skeleton treatment. No unnecessary duplicate request was found in the reviewed first-load flows: Home needs both `/api/trips` and `/api/buses`; Dashboard uses a date/route trip request in addition to its bounded summary so older trips remain selectable.

The server initializes and verifies database readiness before handling requests and emits `database_init` duration logs. No local or production server timing evidence was collected, and production Supabase was not accessed. A Vercel/database cold start may contribute to latency, but it is not established as the cause here. The confirmed cause of the misleading Home state was frontend loading-state timing.

## Changes made

- Home now resets to loading synchronously when a session is restored or login succeeds. It shows bus skeleton placeholders while loading, an error with retry on failure, and the empty state (including Add bus where permitted) only after a successful empty response.
- Late trip, fleet, dashboard and ledger responses are ignored after a newer request or session reset. Concurrent fleet reads are coalesced. Dashboard trip filters enter loading state immediately on tab/filter changes to prevent a flash of stale empty results.
- Dashboard initial content and KPI values now show responsive skeleton placeholders instead of blank/zero-looking content while requests are pending. Existing error and retry paths remain in place.
- Safe frontend request timing logs cover login/session, buses, trips, trip detail, dashboard and financial ledger requests. They contain endpoint labels, duration, status and response size only; no response data, credentials or request bodies are logged.
- No server, database, schema, session-security or financial formula changes were made.

## Timing evidence and limitations

No real request timings were available in this local run. The browser fixture defines synthetic 250 ms bus and 450 ms trip delays for a timing check, but the browser harness hung before producing results. The new runtime logs will allow timings to be collected in a functioning local browser session. Vercel startup/database contribution remains unmeasured.

## Files changed

- `src/App.jsx`
- `src/App.css`
- `src/components/AdminDashboard.css`
- `src/api.js`
- `scripts/dashboard-ui-browser.cjs`
- `docs/handover/districtline-first-login-performance-fix.md`
- `docs/handover/districtline-final-candidate-manifest.json` (regenerated sanitized candidate manifest)
- `docs/handover/districtline-final-verification.json` (offline verification evidence)

## Release candidate

Regenerated locally using the reviewed 74-path allowlist. Offline verification passed: all 74 checksums matched current source, 25 JavaScript files passed syntax checks, there were no missing relative imports, unexpected files, prohibited paths or symlink escapes. No deploy, commit, push or production access occurred.

## Test results

- `npm.cmd run build` — passed.
- `npm.cmd test` — 156 passed, 6 skipped, 0 failed. The skipped tests require independently approved isolated local PostgreSQL evidence; they made no connection.
- `node scripts/release/verify-local-candidate.mjs ...` — passed for all 74 candidate files.
- `node scripts/dashboard-ui-browser.cjs` / `node --test scripts/dashboard-ui-browser.cjs` — did not complete; the browser harness stalled without producing output and was stopped. Therefore browser-based first-login, responsive visual, permission and console checks remain unverified in this run.
- No production or remote database tests were run.

**FIRST-LOGIN LOADING FIXED:** PARTIAL

**ROOT CAUSE**

Home marked trip loading complete during unauthenticated state reset, then exposed authenticated UI before the first post-login trip request started. Dashboard primary API, ledger and trip-filter requests are already independent/concurrent; database startup latency could not be measured locally.

**CHANGES MADE**

Synchronized Home loading state with session/login transitions, added loading/error/confirmed-empty UI, Dashboard skeletons, request timing logs and stale-response guards. Regenerated and verified the sanitized local release candidate.

**TEST RESULTS**

Build passed; automated suite passed (156 passed, 6 skipped, 0 failed); sanitized candidate verification passed (74/74). Browser harness stalled before results, so visual and mobile browser checks are outstanding.

**REMAINING ISSUES**

No actual initial request timings were captured. Re-run the browser acceptance harness in a working local browser environment to verify first-login, refresh, failure/retry, view-only permissions and mobile/desktop layouts. Production/Vercel cold-start contribution remains unverified.
