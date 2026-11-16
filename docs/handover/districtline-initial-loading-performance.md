# District Line initial loading performance

## Confirmed root causes

### Login photograph

`index.html` preloaded `/login-bg-1920x1080.jpg`, while the active desktop and mobile login CSS used `/login-tropical-sunset.png`. The preloaded image was therefore not the image painted behind the login form. The active image is the same bus photograph at 1672×941 and was 2,397,174 bytes. The browser had to discover that larger PNG through the CSS after loading the application styles.

The photograph was re-encoded as a high-quality JPEG, preserving its composition and dimensions. The optimized, versioned asset is 412,388 bytes, an 82.8% reduction. The login page now adds a high-priority preload for the active image only when session verification confirms the sign-in screen is needed. The page and login stage retain their navy fallback. Vercel is configured to cache this versioned image as immutable for one year.

### Repeated and unnecessary requests

- The fleet list was fetched when the app mounted even if the user landed on Dashboard, where the Dashboard response already supplies its bus list. It was also refreshed by both `window.focus` and `visibilitychange`. The in-flight promise coalescer only combines concurrent requests, so separate focus/visibility events could still issue sequential requests. In addition, effect cleanup invalidated the fleet request ID; under React StrictMode effect replay, a remounted effect could reuse that in-flight request after invalidating its result.
- `/api/admin/crew` and `/api/admin/bus-contacts` were requested for every authenticated session. They support Home's crew editor, Accounts crew options and Staff bus management, and are not required for the initial Dashboard render.
- Dashboard's primary summary, revenue ledger, expense ledger and date/route trip list are separate required datasets and are started concurrently. The date/route trip request preserves selection of trips outside the summary's latest-200-trip window; it is not a duplicate of the summary.

### API and database latency

The supplied Chrome screenshot records successful end-to-end responses: trips about 2.89 s; bus-list responses about 1.39 s, 1.45 s and 2.67 s; revenue entries about 3.20 s; expense submissions about 1.54 s; crew about 481 ms. The accompanying request text reports one initial load of about 13.6 s. These are user-provided observations, not measurements repeated from this local workspace. Browser DevTools timings do not split database connection, query, authentication, serialization and network time.

The local Vercel handler code has database readiness initialization and emits `database_init` duration logs, but no production logs or Supabase were accessed. The observed API times do not establish a cold start or slow database query as their cause. No backend query or database change was made.

## Before-and-after measurements

| Measurement | Before | After | Method |
| --- | ---: | ---: | --- |
| Active login background asset | 2,397,174 bytes PNG | 412,388 bytes JPEG | Same 1672×941 photograph, re-encoded locally at JPEG quality 88 |
| Image payload reduction | — | 82.8% smaller | File size comparison |
| Full-body static image response median | 18.29 ms | 4.95 ms | Seven requests per asset through the same local Vite preview on loopback; not a real network/browser benchmark |
| Dashboard entry fleet requests | Previously mounted globally and focus/visibility refreshed | No separate fleet request on Dashboard; one initial request on Home, visibility-only refresh on return | Source-path analysis; browser assertion added but browser harness did not complete |
| Crew/contact lookup requests | Requested on every authenticated session | Deferred until Accounts, Home crew-editor use, or Staff management requires the data | Source-path analysis; browser assertion added but browser harness did not complete |
| API duration after change | Not captured in a completed local browser run | Not captured | The browser harness stalled before emitting its synthetic timing results |

The local preview measurements include Node's loopback HTTP and full-body read. They demonstrate the smaller static payload under identical local conditions; they do not predict production download times. Existing frontend API timing logs capture endpoint, elapsed duration, HTTP status and response size without request/response contents.

## Home and Dashboard loading

The preceding local loading fix remains in place: Home stays in loading state until trips are confirmed, only shows the empty/Add Bus state after a successful empty response, and offers retry on failure. Dashboard shows skeletons instead of misleading initial zero totals. Calculations and API behavior are unchanged. Fleet request invalidation still happens on session reset; effect cleanup no longer discards a valid in-flight request.

## Files modified

- `.gitignore`
- `docs/handover/phase-14-technical-release-fixes.md` (allowlist updated for the optimized image)
- `index.html`
- `public/login-tropical-sunset-v2.jpg` (new optimized copy; source photograph retained)
- `scripts/dashboard-ui-browser.cjs`
- `scripts/release/prepare-local-candidate.mjs`
- `scripts/release/verify-local-candidate.mjs`
- `scripts/security/browser-local.cjs`
- `server/release-safety.test.js`
- `src/App.css`
- `src/App.jsx`
- `src/api.js` (sanitized frontend request timing logs from the preceding local fix)
- `src/components/AdminDashboard.css`
- `vercel.json`

## Tests and release candidate

- `npm.cmd run build` — passed.
- `npm.cmd test` — 156 passed, 6 skipped, 0 failed. Skipped cases require separately approved isolated PostgreSQL evidence; no remote database connection was attempted.
- JavaScript syntax checks for the edited API and synthetic browser scripts — passed.
- `git diff --check` — passed.
- Local Vite preview full-body timing sample — completed for both image assets; see measurements above.
- Synthetic Chrome UI suite — started against loopback fixtures, but the isolated browser harness did not produce test results and was stopped. Login visuals, request count assertions, retries and responsive browser checks therefore remain unverified.
- Sanitized release candidate and manifest — regenerated from the 75-path allowlist and offline verification passed (checksums and source match, no missing relative imports or unexpected files).

No deployment, commit, push, production Supabase access, real record changes, schema changes, booking changes, financial formula changes or permission changes occurred.

**LOGIN IMAGE LOADING STATUS**

Optimized locally: the same photograph now has a matching conditional preload and is 82.8% smaller. Browser-render verification did not finish, and no production improvement is claimed.

**HOME AND DASHBOARD LOADING STATUS**

Explicit loading, success, empty and error states remain implemented. Dashboard no longer makes a separate initial fleet request; Home fleet refresh no longer has overlapping focus and visibility triggers. Browser UI assertions remain unverified because the local Chrome harness stalled.

**MEASURED PERFORMANCE RESULTS**

Local loopback median for reading the full image body fell from 18.29 ms (2,397,174-byte PNG) to 4.95 ms (412,388-byte JPEG) across seven requests per asset. User-provided Chrome API timings are documented above; no after-change API timing is available. No cold-start or database bottleneck was proven.

**FILES MODIFIED**

The file list is recorded in this handover. The sanitized candidate now contains 75 allowlisted paths, including the optimized background.

**REMAINING ISSUES**

Re-run the synthetic browser suite in a working isolated Chrome environment to verify the login image and request-count assertions on desktop and mobile. Production/Vercel API timings and database initialization contribution remain unmeasured; verify those through approved provider telemetry if they need further diagnosis.
