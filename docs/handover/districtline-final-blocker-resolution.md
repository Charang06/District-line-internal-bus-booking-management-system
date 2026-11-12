# District Line — final blocker resolution and release verification

Date: 2026-11-12, Asia/Colombo.

**BLOCKED — EXTERNAL VERIFICATION REQUIRED**

## 1. Executive summary and identity

The local browser blocker is resolved. The final fresh-profile Chrome run passed **58 browser checks**, using synthetic authentication/API responses and only loopback application traffic. Confirmed application defects were fixed: cancellation/finalization/related confirmation dialogs now use the existing accessible dialog component; the Info page now requests the existing bus image and describes the approved four-category/49-seat revenue rule accurately.

The affected offline regression selection passed **16 tests**, with **one real PostgreSQL test skipped**. **62 JavaScript syntax checks**, frontend compilation and exact **74-file** candidate verification passed. PostgreSQL integration, actual Vercel packaging/runtime, repository exposure and immutable rollback identity remain unverified. These are separate release gates; passing mocked browser tests does not satisfy them.

Comparison baseline remains the user-confirmed production SHA `666e833237845cc702b872f58542e2174b718372`. Local HEAD remains `0e102255342c220a34a8ee573f1ac5f1227e33aa`, branch `ui/admin-dashboard-handover`, with existing uncommitted work preserved and no staged changes. HEAD is not the candidate identity because the candidate includes working-tree changes. No provider association was independently refreshed.

Reviewed the requested Phase 12–14 reports, complete readiness report, original manifest and verification evidence. Their previous counts are historical and are not included in current totals. Historical reports and the original candidate remain intact. This report supersedes their browser-blocker status and candidate identity only as stated here.

## 2. Browser root cause and harness repair

The original `CDP timeout Page.enable` was reproduced with a diagnostic that captures bounded Chrome stderr. Chrome's browser process answered `Browser.getVersion` and target discovery, but GPU subprocesses repeatedly exited with `-1073741790` (`0xC0000022`, access denied), followed by `GPU process isn't usable. Goodbye.` Page commands could not complete as the browser failed.

An A/B run used the same executable and startup flags with a newly generated profile outside the command sandbox, through the execution approval mechanism. Chrome 157.0.8103.39 then completed page attachment, `Page.enable` and `Runtime.evaluate` successfully. This establishes the command sandbox's subprocess restrictions as the observed launch blocker. Increasing CDP timeouts or disabling Chrome/TLS security was unnecessary.

Additional defects exposed after launch were in the test harness: a wait returned a DOM object with `returnByValue`, causing `Object reference chain is too long`; the synthetic SMS-balance response omitted required fields; some expanded test selectors/expectations did not match the actual DOM/API contract. Those fixtures and selectors were corrected, while genuine application failures were fixed in application source. Failed exploratory runs are not counted as final successes.

The repaired harness discovers installed Chrome with Edge as an executable fallback; uses a fresh temporary profile; checks loopback server readiness and page-target type; bounds socket/HTTP/CDP commands; retains bounded stderr; blocks external page requests; clears CDP timers; closes its own browser normally and uses PID-scoped process-tree termination only as a fallback. Existing profiles, cookies, credentials and historical artifacts are never loaded. Temporary synthetic profiles are retained outside candidates. The successful runs exited with browser code 0.

The CDP command timeout remains **30 seconds**. The original launch failed even with that timeout; the fix is the working execution context plus diagnostic/lifecycle repairs. `scripts/release/browser-probe.mjs` remains available for a loopback-only `about:blank` diagnostic. It is not a release asset.

## 3. Browser acceptance results and limits

Final command, run through the approved outside-sandbox execution path:

```text
node scripts/release/browser-offline.mjs docs/handover/districtline-final-candidate-manifest.json
```

**58 passed, 0 failed, 0 skipped.** Evidence: [districtline-final-verification.json](districtline-final-verification.json). These are actual Chrome DOM interactions with mocked API persistence, not real PostgreSQL or provider tests.

| Area | Executed browser coverage |
|---|---|
| Login/session | Login layout at 320/390/768/1440, synthetic login, sign-out confirmation/logout, expired-session event returns to login |
| Navigation | Admin Home, Log, Info, Dashboard, Customers and Staff; Accounts Manage/View navigation; Accounts absent for ungranted staff |
| Responsive layout | All six admin pages, Accounts for admin/Manage/View, Expense layout and login at all four widths; cancellation and finalization dialogs at all four widths; no page overflow or controls below the checked usable height |
| Loading/errors | Fresh dashboard delayed response, explicit synthetic 503, visible loading/error state and successful retry |
| Accounts View | Revenue/Expense submit controls hidden, no scoped manager reads, no duty management panel or writes |
| Manual revenue | Restricted crew options, exactly four original category inputs, combined 50 blocks submission, combined 49 submits, submitted payload and updated ledger checked |
| Expenses | Synthetic submission and locked ledger rendering for admin and Accounts Manage |
| Duties | Creation, scoped refresh, expense/adjustment entry, confirmed deletion of both kinds, finalization and refresh, mutation controls hidden after finalized state |
| Modal keyboard | Initial focus inside finalization and cancellation dialogs; finalization Tab containment; Escape dismisses; cancellation Escape sends no cancellation write |
| Booking/Log | Synthetic trip/seat selection, booking submission and selected-seat reset; passenger appears in Log; cancellation interface opens and Escape preserves booking |
| Resource/console checks | No uncaught exceptions or console errors, no failed local resources, no unexpected network errors, no unmatched fixture API calls in tested Accounts modes |

The backend financial/authorization HTTP matrix remains independently tested with fake PostgreSQL. Browser visibility is not the authorization boundary. The browser fixture does not implement real server authorization, session cookies, transactions, financial calculations or persistence. Its synthetic totals are test data; they do not replace application formulas.

The Accounts revenue ledger has no separate status column; its test verifies the submission path and returned locked synthetic entry plus displayed revenue, not an invented status badge. Customers/Staff acceptance here covers navigation, rendering and responsive empty-state fixtures, not every create/edit workflow. Actual cancellation persistence, real cookie/proxy behavior, recovery delivery, real concurrency and full database-backed browser acceptance remain unverified. No screen-reader audit, physical-device test, visual screenshot approval or performance/load certification is claimed.

## 4. Confirmed application fixes

`src/App.jsx` now renders cancellation, duty finalization and non-Staff action confirmations with the existing `StaffDialog`. It already uses a native modal dialog, contains keyboard focus, handles Escape and restores prior focus. Existing callbacks, financial values, acknowledgements, busy/finalization guards and booking/cancellation implementations are unchanged. The final browser run verifies the repaired keyboard behavior.

`src/components/InfoGuide.jsx` requested `/bus.jpg`, which does not exist in public assets or the reviewed candidate. Two actual browser 404s exposed this issue. It now references existing `/bus.webp`; the final resource check passes. The guide's obsolete suggestion of additional revenue rows was replaced with the approved four categories/49 combined seats and separate cargo rows. No new financial rule was introduced.

## 5. PostgreSQL availability and prepared integration

No independently approved disposable instance or isolation attestation is available. `psql`, `postgres`, `pg_ctl`, Docker and Podman were not discovered on PATH; standard Program Files PostgreSQL/Docker/Podman directories were not found. This bounded discovery is not proof that no installation exists elsewhere. No existing database, container daemon, credential store, environment file or protected endpoint was queried. No database was provisioned, connected, initialized, seeded, reset or migrated.

**Actual PostgreSQL results: 0 executed, 0 passed, 1 skipped.** The integration test's no-attestation path was verified without a connection. Repeated skip checks are not additional tests.

Prepared entry: `server/disposable-local-integration.test.js`. New `server/test-support/disposable-attestation.js` validates explicit lifecycle/isolation approval fields, fixed loopback host, valid port, nonempty owner/process/storage evidence fields and a timestamp less than one hour old and not in the future. It cannot independently certify an operator's assertions; independent owner verification remains mandatory. It rejects TLS bypass environment flags before pool construction. Three offline tests exercise these failure boundaries and verified TLS/no application-URL fallback.

The integration suite uses only injected test PostgreSQL and mocked delivery, never `.env` or production URLs. It requires an already initialized, empty application baseline; `requireEmptyApplication` refuses occupied application tables before fixtures. Prepared scenarios now cover startup baseline, selected required columns, application-table grants, principal indexes and foreign-key metadata; seat duplicate/concurrent conflicts; cancellation/rebooking and seat-release state; locked revenue/expense persistence; four-row and individual/combined 49 limits; duty create/add/delete/finalize; finalized financial/booking/cancellation immutability; admin/Manage/View/legacy/missing permissions; and a deliberately failed transaction followed by rollback. Cleanup remains scoped to generated synthetic identities and is now protected by nested finally blocks.

These database scenarios are **prepared, not executed or certified**. A real run may reveal fixture/schema issues. Exhaustive application-level connection/audit failure injection, all schema-column/constraint definitions and every permission/write combination still require real isolated acceptance. Existing mocked startup missing-prerequisite tests are historical evidence unless separately rerun; no schema was dropped to simulate failure here.

### Exact missing prerequisites and operator procedure

1. The owner must independently identify a dedicated disposable local PostgreSQL process/container, dedicated storage/network, no real/shared data, no protected project/backup linkage and no delivery integrations. A localhost name alone is insufficient.
2. Explicitly approve initialization and destruction of synthetic data. If the schema does not already exist, separately authorize a reviewed synthetic-target initialization procedure; this suite never initializes/migrates automatically. Do not reuse the protected restore project.
3. Supply a certificate valid for localhost and trusted by the Node process; retain TLS certificate/hostname verification. A separately approved local CA can be supplied through Node's trust mechanism before process startup. Do not set TLS bypass flags.
4. Write an operator-owned attestation outside release artifacts containing the fields below, based on actual evidence. The example is a shape, not approval or a usable database identity:

```json
{
  "ownerApproved": true,
  "syntheticOnly": true,
  "emptyDatabase": true,
  "independentStorage": true,
  "noProtectedProjects": true,
  "noDeliveryIntegrations": true,
  "syntheticDataLifecycleApproved": true,
  "host": "127.0.0.1",
  "port": 5549,
  "database": "owner-specified-synthetic-database",
  "user": "owner-specified-test-user",
  "processOrContainerId": "verified-dedicated-instance-identity",
  "isolationEvidence": "Record independently checked storage, ownership, network and absence of protected/shared data",
  "verifiedAt": "replace-with-fresh-ISO-timestamp"
}
```

5. Only after verification, provide process-scoped `DISTRICT_DISPOSABLE_LOCAL_TESTS=owner-attested-empty-local-only`, `DISTRICT_DISPOSABLE_ATTESTATION` pointing to that JSON, and `DISTRICT_DISPOSABLE_PASSWORD` through the owner's secure process. Never copy credentials into reports/candidates. Run:

```text
node --experimental-vm-modules --test server/disposable-local-integration.test.js
```

6. Retain actual results and complete the uncovered acceptance cases before calling database integration passed. Do not bypass an isolation, TLS, occupied-table or baseline failure to get a green test.

## 6. Offline Vercel compatibility

| Check | Current result / remaining limit |
|---|---|
| Configuration | Existing Vite framework, npm build, dist, sin1 and API-before-SPA rewrites retained; parsed/config tests pass |
| API adapters | Four entries present; executable adapter tests preserve rewritten/direct route, query, method and body |
| Import closure | All relative imports resolve inside 74-file allowlist; bare imports belong to declared packages or Node built-ins; no external runtime source copied |
| Packages/Node | Package dependency declarations match lock root. Local Node v24.11.0 works with installed Vite 8.3.4; installed Vite's Node range is `^20.19.0 || >=22.12.0`. No engines pin added; effective provider Node remains unknown |
| Native sqlite3 | Existing installed Windows module loaded successfully, SQLite version 3.52.0; no database object/file opened. This does not verify clean Linux/native installation or Vercel bundling |
| Build/assets | Final candidate compiled: 50 modules, 3 in-memory outputs. No environment-file loading, public-directory copying, inherited VITE flag activation, dist overwrite or install. Expected public URL build warnings arise from `publicDir:false`; browser serves candidate assets and final resource checks pass |
| SQL packaging | Only registered inert 001–004 included where needed; 005/006 SQL not runtime-read assets; 008/009 absent and explicitly excluded; configuration tests pass; no SQL executed |
| TLS | Public CA and CommonJS verified-TLS helper included; certificate/hostname verification retained; real endpoint handshake/pooler behavior unverified |
| Storage | Hosted source skips local-upload mkdir and uses existing remote-storage path. Isolated storage/provider configuration and ephemeral-filesystem behavior still require provider acceptance |
| Cookies/auth | Existing persistent hashed sessions, HttpOnly/Secure/SameSite behavior retained; browser session transitions are mocked. Actual Vercel proxy/origin/cookie behavior remains unverified |
| Flags | Build-time username/email-verification/MFA UI flags and corresponding server guards reviewed from source only. Preserve previously approved recovery states; no MFA, new limiter or recovery feature activated. No live settings/values read |

The known MFA profile-password replacement-session marker problem remains a blocker to any future enforcement activation. These UI fixes do not change that flow. No Vercel CLI/provider request, dependency install, remote configuration fetch, function trace, deployment or promotion ran. Actual clean provider install/build, native Linux behavior, dynamic tracing/include-exclude precedence and runtime routing still require separately authorized verification.

## 7. Metadata-only Git security review

Git still tracks **136 Chrome-profile paths** and **nine artifact profile-image copies**. Path history still contains them; the latest recorded change for the profile directory is in `0e10225` dated 2026-11-12. File contents were not opened. Both candidate inventories exclude all those paths, private artifacts, backups, operational files, `.env`, uploads, local databases and Git history.

Sanitized local remote metadata shows an HTTPS origin on `github.com`, a repository path and no embedded URL user information. The remote URL/path was not printed in the report, and no provider was contacted. This proves neither repository privacy nor absence of credentials elsewhere. Visibility, collaborators, forks, prior downloads, CI artifacts, Vercel source retention and historical credential validity remain unknown.

**A wholesale push/deployment of current HEAD or its history remains unsafe.** Ignore rules do not remove tracked files/history. Potential credential-bearing browser filenames justify security review; actual credential presence or exposure is unconfirmed. Candidate exclusions do not resolve history exposure.

Owner checklist for separately authorized review:

- Confirm repository ownership/visibility and current/former collaborators, teams, forks and access history through an approved metadata-only process.
- Establish whether the affected commits, CI artifacts, source uploads or deployment source bundles were ever shared or retained elsewhere.
- Have an authorized security owner assess credential/session exposure privately without copying private contents into reports. Revoke/rotate only with separate authorization and evidence-based scope.
- Approve a sanitized publication/deployment-source method for the existing project. Never push the existing history as the clean candidate.
- Preserve evidence and obtain separate approval before deleting tracked private files, rewriting history or changing access controls. Record what exposure could not be determined.

## 8. Original and new clean candidate verification

Original candidate remains untouched:

```text
release-candidates/districtline-2026-11-12T15-00-52-376Z
```

Its original manifest remains byte-for-byte at `districtline-clean-candidate-manifest.json`, SHA-256:

```text
cd17e60fdbeb43a9d178f57afd6fd75dff269978e5678b5401e02cfb00ebb6f5
```

At task start it matched current source and all hashes. Final historical verification still confirms all 74 original hashes, exact membership/import closure and no symlink escape. It now differs from current source at exactly `src/App.jsx` and `src/components/InfoGuide.jsx`, as expected from the new fixes. Historical mode records those differences instead of pretending source equality.

Final candidate, tested by the successful browser run:

```text
release-candidates/districtline-2026-11-12T15-17-59-452Z
```

Full absolute path, 74-file manifest, byte sizes and individual SHA-256 hashes: [districtline-final-candidate-manifest.json](districtline-final-candidate-manifest.json). Manifest SHA-256:

```text
df7a9232d32139a69b0b8866b05fa04ff8eb60c8be3762d7a28dcd30ae2cd018
```

Final verification: **74/74 matching hashes and sizes, exact membership, current-source equality, zero missing relative imports, declared external package closure, zero prohibited paths and no symlink/junction escape**. The same reviewed explicit allowlist was used; no directories were copied recursively. No `.git`, node_modules, environment files, browser profiles, backups, archives, private artifacts, uploaded images, test evidence, reports, local databases, historical build outputs or unapproved SQL entered the candidate.

An intermediate local candidate created during dialog repair was superseded and retained; it is not the nominated release candidate. No candidate directory was modified in place or deleted. Preparation/verification scripts now default to separate final manifest/evidence names to protect historical metadata.

Reproduction:

```text
node scripts/release/verify-local-candidate.mjs docs/handover/districtline-final-verification.json docs/handover/districtline-clean-candidate-manifest.json --historical
node scripts/release/verify-local-candidate.mjs docs/handover/districtline-final-verification.json docs/handover/districtline-final-candidate-manifest.json
```

The candidate is source for review, not an installed/provider-built deployment package. Future source changes require a new candidate and new hashes.

## 9. Files modified by this task

| File | Change |
|---|---|
| `src/App.jsx` | Accessible wrappers for existing cancellation, duty-finalization and action confirmation dialogs |
| `src/components/InfoGuide.jsx` | Existing bus asset path and accurate approved revenue guidance |
| `scripts/release/browser-offline.mjs` | Diagnostics, bounded launch/readiness/target checks, cleanup, realistic mocked state, actual console/resource checks and expanded acceptance wiring |
| `scripts/release/browser-acceptance.mjs` | New real-browser form/navigation/responsive/keyboard/session scenarios using synthetic APIs |
| `scripts/release/browser-probe.mjs` | New bounded about:blank CDP launch diagnostic |
| `scripts/release/prepare-local-candidate.mjs` | Separate selectable final-manifest output; original candidate preserved |
| `scripts/release/verify-local-candidate.mjs` | Root/file realpath protections, size/hash/denylist/bare-import checks, historical integrity mode and separate final evidence |
| `server/test-support/disposable-attestation.js`, `server/disposable-attestation.test.js` | New fail-closed isolation/lifecycle/TLS gate and three offline tests |
| `server/disposable-local-integration.test.js` | Uses validated gate; stronger prepared grant/index/constraint, seat, financial/deletion/immutability coverage; reliable pool cleanup |
| `.gitignore` | Exceptions for exactly this report and two new final JSON deliverables; protected exclusions retained |
| `README.md` | Links current report and preserves previous evidence link |
| `docs/handover/districtline-final-blocker-resolution.md`, `districtline-final-candidate-manifest.json`, `districtline-final-verification.json` | Report, per-file hashes and machine-readable final evidence |

All prior financial/server/permission/configuration changes were retained. Historical reports were not rewritten. No business formula, limit, permission, booking/cancellation transaction, locked persistence or authentication/recovery behavior was altered.

## 10. Current test counts and commands

| Category | Pass | Fail | Skip | Meaning |
|---|---:|---:|---:|---|
| Final browser acceptance | 58 | 0 | 0 | Actual Chrome, synthetic APIs |
| Affected offline regression selection | 16 | 0 | 1 | 17 tests: pure/source/server-render/fake-pg HTTP plus skipped real DB suite |
| Real isolated PostgreSQL | 0 | 0 | 1 | Same skipped test, not an additional test |
| Syntax | 62 | 0 | 0 | Parse checks across server/src/api/release scripts; JSX/CSS compiled |
| Candidate compilation | 1 | 0 | 0 | Vite in-memory build; 50 modules/3 outputs |
| Actual provider tests | 0 | 0 | 0 | None authorized or executed |

Do not add categories into one production-success total or double-count repeated tests. Historical 56-test results were not rerun wholesale. The focused current command was:

```text
node --test server/disposable-attestation.test.js server/disposable-local-integration.test.js server/release-safety.test.js server/financial-policy.test.js src/data/revenueSeatRows.test.js src/data/staffPageAccess.test.js
```

It covers baseline financial parity, client counts/fares, server permission/minimization matrix, duty component rendering, API adapters, migration packaging and the new disposable-target guard. Final integration-harness edits were syntax-checked and the no-instance path rechecked as skipped. Browser fixes were rerun until the final nominated candidate passed all 58 checks. `git diff --check` passes; only line-ending advisories were emitted. Protected file paths and original HEAD/branch were preserved.

## 11. Remaining external blockers and exact next action

The browser launch/acceptance blocker is resolved locally. Remaining gates are:

1. Independently verified disposable PostgreSQL instance, trusted localhost TLS and explicit synthetic data lifecycle attestation; run and complete real integration acceptance.
2. Separate authorized review of the existing Vercel project's identity, effective Node/build/runtime/feature settings, actual function bundles/native Linux installation, and current immutable production identity. No provider access is authorized by this task.
3. Owner security review of tracked private history and remote exposure; approve a sanitized source-transfer method.
4. Verified compatible immutable rollback deployment, configuration/schema/flag compatibility and rollback eligibility.

**Exact next action:** the owner establishes or identifies the independently disposable PostgreSQL environment under the explicit procedure in section 5 and supplies its fresh isolation/lifecycle attestation. Then execute the prepared suite and real database-backed acceptance. Independently authorize the metadata/security/provider review needed for sections 12–13. Do not deploy Preview or push current HEAD.

## 12. Preview prerequisites for the existing project

Confirm the existing team/project IDs and domain mapping for `https://districtlinebooking.com/`; record current immutable production deployment ID/full SHA through a separately authorized metadata-only review. Confirm effective install/build/output/root/Node settings and approved non-secret flag names/states, preserving disabled MFA/new limiter and existing recovery compatibility. Never expose secret values.

Resolve history exposure and approve only the final checksummed sanitized candidate for source transfer. Independently verify dedicated Preview database/storage and mocked delivery with no production or protected backup linkage. Complete real PostgreSQL and database-backed browser acceptance. Obtain explicit Preview deployment approval separately.

After that approval only, inspect a real existing-project build's native install, CA/helper presence, import traces, SQL inclusion/exclusion, private-path absence and actual routes/assets. Record immutable Preview ID/digest and acceptance results. This report creates no project, Preview or deployment approval.

## 13. Production and rollback prerequisites

Before future production approval, an authorized operator must complete and record this checklist for the same existing Vercel project:

| Required record | Current status |
|---|---|
| Verified team/project/domain association | Unknown remotely |
| Current immutable production deployment ID and full source SHA | Deployment ID unknown; comparison baseline supplied by owner only |
| Previous known-good immutable deployment ID/full SHA | Unknown; no rollback target certified |
| Effective Node, build, function, region and origin/cookie configuration | Local source reviewed; effective provider configuration unknown |
| Approved server/browser flag states and recovery prerequisites | Live state unknown; no activation permitted |
| Source/config/schema/storage compatibility of rollback target | Unverified; no migrations or data changes performed here |
| Same-project access, deployment retention and rollback eligibility | Unverified |
| Passing isolated Preview DB/browser/runtime acceptance and candidate digest | Local mocked browser/digest available; real Preview/DB evidence pending |

An operator must verify rollback compatibility before promotion, document agreed failure thresholds, authorized rollback actor and exact existing-project deployment/alias procedure, and obtain explicit production approval for the passing immutable candidate. Do not invent deployment IDs or assume a cached Git ref identifies a live deployment.

After a future authorized promotion, use only agreed non-mutating checks such as domain/TLS, static assets, `/api/health` and approved error/latency telemetry. Do not use real bookings, cancellations, finance writes or delivery as smoke tests. Authenticated GETs may touch sessions or reconcile full dashboards and must not be called strictly read-only probes.

On threshold failure, an authorized operator uses the preverified same-project rollback target/procedure, checks alias and non-mutating health, and records the result. Rolling back application code does not restore database/schema/storage or feature configuration. No reverse SQL, protected restore or credential rotation is included in that procedure or authorized here.

## 14. Final recommendation and stopping point

**BLOCKED — EXTERNAL VERIFICATION REQUIRED.** All reported current local checks pass within their stated scope. The browser failure and confirmed local UI/asset defects are resolved. Real PostgreSQL, provider runtime, Git exposure and rollback verification remain incomplete; production readiness is not claimed.

No deployment, commit/push/history mutation, protected database access, real SQL/migration, credential/environment-file inspection, real booking/finance operation, delivery, remote setting change, dependency install, paid resource, security activation, private-file/backup modification or deletion occurred. Work stops after this report.
