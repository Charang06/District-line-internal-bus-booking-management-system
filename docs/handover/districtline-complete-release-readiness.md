# District Line — complete release readiness

Date: 2026-11-12, Asia/Colombo.

**BLOCKED — EXTERNAL VERIFICATION REQUIRED**

## Executive assessment

The reviewed local application candidate preserves the approved financial rules and staff authorization. A separate 74-file allowlisted candidate was created and compiled offline. Local checks pass within their stated scope. This is not a verified Vercel release: PostgreSQL isolation is unavailable, browser automation failed before page acceptance, and provider/runtime/rollback identity remains unverified. No Preview/Production deployment or Git push is authorized by this report.

Historical Phase 12–14 and full-vercel-deployment-readiness reports are unchanged. Their findings are superseded only by the specific current evidence below. README startup/release guidance and the trip-ledger column mismatch were already corrected in the working tree when this execution began; these changes were reviewed and retained.

## Baseline and candidate identity

- User-confirmed production comparison: `666e833237845cc702b872f58542e2174b718372`. Current provider association was not independently checked.
- Local HEAD: `0e102255342c220a34a8ee573f1ac5f1227e33aa`.
- Branch: `ui/admin-dashboard-handover`.
- Working tree is dirty; no staged changes were reported. HEAD alone does not identify the candidate, which incorporates uncommitted work.
- No reset, checkout, stash, clean, commit, merge, rebase, fetch, push or Git configuration change occurred.

## Completed local work and changed-file inventory

All existing Phase 13/14 edits were preserved. This execution reviewed the inherited unfinished release work, created the clean candidate/evidence/report, added candidate verification and API adapter coverage, and strengthened the unexecuted disposable PostgreSQL harness. No new application financial, authentication or permission policy was introduced.

| Paths changed relative to HEAD | Purpose / provenance |
|---|---|
| `server/revenue-seat-rows.js`, its test, `src/data/revenueSeatRows.js`, its test | Retained Phase 13 four-row/49-seat baseline correction and parity checks |
| `server/server.js` | Retained approved financial guards, restored validation and Phase 14 minimized reads |
| `src/App.jsx`, `src/api.js`, `src/components/AccountsDuties.jsx` | Retained restricted crew/duty loading, manager UI, mutation refresh and existing duty actions |
| `src/components/AccountsRevenue.jsx` | Retained financial correction, explicit manager notice, read-only gating and nine-column trip ledger header alignment; no trip net-return formula added |
| `vercel.json` | Retained explicit registered SQL 001–004/TLS inclusion and 008/009 exclusion |
| `server/financial-policy.test.js`, `server/test-support/financial-policy-local-worker.mjs`, `server/test-support/accounts-duty-render-worker.mjs` | Retained synthetic HTTP, baseline financial comparison and component-render coverage |
| `server/release-safety.test.js` | Packaging/UI checks plus new executable adapter URL/method/body/query preservation regression |
| `server/disposable-local-integration.test.js` | Opt-in local-only integration harness; freshness/port checks, canonical seat, concurrent conflict, schema columns, grants, locked entries, legacy/missing permissions and failed-transaction rollback preparation |
| `scripts/release/prepare-local-candidate.mjs` | Reviewed existing allowlist-only copier; validates all paths before copying |
| `scripts/release/browser-offline.mjs` | Reviewed existing fresh-profile Chrome/CDP harness, mocked API, loopback-only serving and blocked external browser requests |
| `scripts/release/verify-local-candidate.mjs` | New exact file-set, SHA-256, source equality, relative import, syntax and lock-root verification |
| `README.md`, `.gitignore` | Retained corrected startup/policy/release instructions and narrow exceptions for exactly three new report/evidence files; candidate outputs ignored |
| `docs/handover/districtline-complete-release-readiness.md`, `districtline-clean-candidate-manifest.json`, `districtline-local-verification.json` | Current report, complete per-file size/hash manifest and build/browser/candidate evidence |

Original browser profiles, private artifacts, uploads, databases, backups and archives were neither opened nor modified. The original runtime source was not copied recursively. Historical reports remain ignored under the existing rule; only the three named new deliverables are exposed by the narrow exception. `.env` and `.private-security` exclusions remain effective. No staging occurred.

## Staff authorization matrix

The actual Express middleware/routes were exercised over loopback HTTP with injected fake PostgreSQL, synthetic users and mocked delivery. Passing a guard does not establish successful real database persistence.

| Identity | Accounts summary / expense reads | Scoped crew and duties | Nine financial writes | Unscoped dashboard/full revenue, staff and crew administration |
|---|---|---|---|---|
| Admin | Allowed | Allowed | Allowed through original handler guards | Existing admin policy |
| Explicit Accounts View + Manage | Allowed | Allowed | Allowed through original handler guards | Denied |
| Accounts View only | Allowed | 403 | 403 | Denied |
| Legacy Accounts without explicit Manage | Allowed | 403 | 403 | Denied |
| No Accounts, missing/malformed/JSON-null/scalar permissions | 403 | 403 | 403 | Denied |
| Manage true, View false | 403 | 403 | 403 | Denied |
| Unauthenticated | 401 | 401 | 401 | Authentication required |

Financial writes covered: expense, expense submission, manual revenue, duty creation, duty expense, duty adjustment, each deletion, and finalization. Accounts-only Manage does not grant booking, cancellation, trip/cargo creation, staff administration or crew management. Denied calls do not touch business-finance storage in the mock assertions.

Crew selector DTO is exactly `id`, `full_name`, `role` for active crew. Duty reads map nested journey revenue, financial entries, totals and creation options, excluding contact/private metadata, raw snapshots and creator/finalizer identities. Minimized reads avoid full-dashboard reconciliation and business writes; normal session activity can still update sessions.

Frontend review/render tests cover manager-only mounting, finalized read-only controls and completion gating. The browser harness was prepared to verify crew options, fixed count controls, finalization/refresh, View-only forms and navigation. None of those browser assertions completed because page automation failed. Successful real-database duty create/expense/adjust/delete/finalize and post-save browser refresh remain acceptance gates.

## Financial policy verification

Baseline-versus-current mocked route comparisons cover 18 synthetic manual revenue cases. Client/server acceptance parity covers 135 count/fare combinations. Exactly four positional categories remain: Standard, Intermediate, Special, Agent / Extra. Counts are nonnegative safe integers, at most 49 individually and combined; fares retain original whole-rupee coercion and 0..100,000,000 bounds. Cargo remains independently limited to 30 validated rows with original bounds. Empty submission rejection, canonical labels, totals, locking and validation order remain baseline behavior.

Ten non-revenue handler bodies, duty serialization/calculation functions, dashboard financial formula blocks and Accounts route-ledger manual/daily precedence match the supplied production source. The obsolete trip ledger Net Return header was removed to match its existing nine cells; no value or formula was invented. Real persistence, failure atomicity and finalized immutability remain unverified. Existing manual revenue insert/code-update/audit sequencing must not be described as proven atomic from mocked comparisons.

## Verification results

| Category | Current evidence | Limit |
|---|---|---|
| Offline unit, source, mocked HTTP, server-render suites | 56 distinct tests passed, 0 failed, 0 skipped | Initial selection: 55 passes; adapter test subsequently added and all four affected release-safety tests passed. Repeated tests are not added to the total |
| Real PostgreSQL suite | 1 skipped, 0 executed, 0 passed | Explicit no-isolation skip; no connection attempted |
| Browser acceptance | 0 acceptance assertions completed; 1 harness failure | `CDP timeout Page.enable`; no visual/responsive/accessibility or session-flow pass |
| Candidate frontend build | Passed: Vite 8.3.4, 50 modules, 3 in-memory outputs | Existing installed dependencies; no clean Linux install or provider build |
| JavaScript syntax | 58 source/test/release-script files passed | Includes 25 candidate JS/CJS files separately verified; JSX/CSS compiled by Vite |
| Candidate file integrity | 74/74 hashes match, 0 unexpected files, 0 missing relative imports, source equality passed | Static imports; no provider dynamic trace |
| Package consistency | Root dependencies/devDependencies match lockfile | Native installation/runtime not executed |
| Provider/TLS endpoint/delivery | 0 tests executed | No Vercel, Supabase, SMS or email request |

Initial exact selection:

```text
node --test server/admin-mfa.test.js server/database-startup.test.js server/database-tls.test.js server/login-rate-limit.test.js server/revenue-seat-rows.test.js server/customer-dashboard.test.js src/data/customerAnalytics.test.js src/data/staffPageAccess.test.js src/data/revenueSeatRows.test.js src/data/tripOverview.test.js src/data/recoveryEmailVerification.test.js scripts/dashboard-ui.test.cjs server/security-http.test.js server/financial-policy.test.js server/release-safety.test.js server/disposable-local-integration.test.js
```

After adding adapter coverage: `node --test server/release-safety.test.js` → 4 passed. The strengthened PostgreSQL file is opt-in and has no real execution evidence. Syntax checks were repeated for modified files. Broad `npm test`, backup/security executors and integration files with external connection capability were not run.

Candidate commands used:

```text
node scripts/release/prepare-local-candidate.mjs
node scripts/release/browser-offline.mjs
node scripts/release/verify-local-candidate.mjs
```

Build disables env-file loading, removes inherited `VITE_*` names in its child process, disables public-directory copying and writes no build files. Eight public URL warnings are expected under `publicDir:false`; the referenced font/images exist in the candidate and the browser harness serves only candidate public files. This proves compilation, not a standard Vercel build. Chrome used a newly created temporary profile, no existing authenticated session, mocked fetch responses and external request blocking. Its temporary profile was retained outside the candidate; no profile deletion was performed. Browser script exit was 1 and is explicitly retained as failed harness evidence.

## PostgreSQL isolation and prepared procedure

No operator-provided evidence identifies a disposable local instance, independent storage/network or absence of real data. `psql`, `postgres` and `docker` were not discovered on PATH; that alone does not prove none is installed. No credentials or environment-file contents were inspected, no instance was provisioned, and no database query, seed, SQL or migration ran.

Prepared entry: `server/disposable-local-integration.test.js`. It never loads `.env`, never falls back to application connection settings and requires a fresh attestation before opening a pool to `127.0.0.1` with verified TLS. It first rejects occupied application tables and checks read-only startup metadata. Tests require an already initialized approved baseline; they do not initialize it. The loopback API loader uses injected PostgreSQL, suppresses startup migration/seeding and mocks delivery.

Future operator prerequisites: independently attest process/container identity, dedicated storage/network, synthetic/empty application data, no protected projects and no delivery integrations. Provisioning/schema initialization, if needed, is a separate authorized procedure. An attestation JSON must contain `ownerApproved`, `syntheticOnly`, `emptyDatabase`, `independentStorage`, `noProtectedProjects`, `noDeliveryIntegrations` all true; `host` exactly `127.0.0.1`; a valid local `port`, `database`, `user`, `processOrContainerId`, substantive `isolationEvidence`, and fresh ISO `verifiedAt`. Supply a locally trusted localhost certificate; do not disable verification. Supply any password through the operator's secure process, never documentation.

Only after those facts are verified, set the process-scoped opt-in `DISTRICT_DISPOSABLE_LOCAL_TESTS=owner-attested-empty-local-only`, the attestation path `DISTRICT_DISPOSABLE_ATTESTATION`, and `DISTRICT_DISPOSABLE_PASSWORD` securely, then run:

```text
node --experimental-vm-modules --test server/disposable-local-integration.test.js
```

The prepared suite covers key columns, partial seat uniqueness metadata, booking grants, duplicate/concurrent seat conflicts, cancellation/rebooking, locked revenue/expense records, original limits, duty expense/adjustment/finalization, View/Manage/legacy/missing permissions and failed-transaction rollback. It has not been run against PostgreSQL and may need fixture corrections revealed by real execution. Do not label preparation as integration success. Complete remaining catalog checks for all runtime columns, constraints, indexes and grants, missing-prerequisite startup cases, seat-release availability, duty deletion, all permission/write combinations and application-level failure injection/rollback before database acceptance. Existing `server/duty-management.test.js` provides additional scenarios but its older remote-target opt-in is not authorization to connect anywhere.

## Vercel compatibility and feature safety

Static configuration: Vite framework, `npm run build`, `dist`, region `sin1`; existing API rewrite precedes SPA fallback. All four API entries are present. The common adapter restores rewritten paths and query strings; the direct revenue adapter preserves POST/body and removes routing-only query state. New executable regression passes. Express import closure resolves within the candidate.

Only registered inert SQL 001–004 plus `certs/supabase-prod-ca-2021.crt` and `scripts/lib/supabase-verified-tls.cjs` are explicitly included. 008/009 are excluded and absent from the candidate; 005/006 SQL assets are also absent because runtime recovery modules do not read them. No migration executes as a deployment hook. Actual function tracing and include/exclude precedence remain provider checks.

Local Node is v24.11.0. No `engines` pin is present. Installed Vite requires `^20.19.0 || >=22.12.0`; effective existing-project Node/build settings remain unknown. `sqlite3` remains declared/locked although current runtime imports do not require it. Native clean-Linux installation and packaging must be verified; no dependency was removed or installed. No offline Vercel function package was produced.

Hosted uploads use the existing remote-storage path; local upload mkdir is skipped under VERCEL. Confirm approved isolated storage/configuration and origin behavior on Preview; ephemeral function storage is not durable upload storage. Pool settings, concurrency and real endpoint TLS compatibility remain unverified. TLS chain/hostname verification remains enabled with the public CA/helper included.

Login/session and recovery mocks pass. Hashed persistent sessions, HttpOnly cookies, original idle/absolute expiry and production Secure handling remain unchanged. Verify actual proxy/CORS/SameSite/cookie behavior on isolated Preview. Server/browser username-recovery flags and recovery-email verification flags must match their previously approved states and existing schema dependencies. `VITE_*` is build-time public configuration; credentials must never be exposed there. No live values were read and current remote states are unknown.

MFA and the new login limiter remain unactivated. Keep `ADMIN_MFA_MODE` off, `ENABLE_LOGIN_RATE_LIMIT` disabled and enrollment UI disabled unless a separate approved activation plan establishes otherwise. Do not newly enable recovery features. The known profile-password session replacement omits the MFA verification marker; future MFA enforcement remains blocked until the intended reauthentication/session behavior is designed and tested. This release preparation does not change that authentication flow.

## Private Git assessment

Path-only Git metadata confirms 136 tracked chrome-profile paths and nine tracked artifact profile-image copies. All are outside the candidate. Other artifacts/operational tools, backups, private material, `.env`, uploads, local databases, `.git`, existing node_modules and historical dist are absent from the exact candidate set.

The committed tree/history still carries those private paths. A normal Git-connected deployment/source upload can carry tracked artifacts; `.gitignore` and these function migration exclusions do not remove tracked source or history. **The current candidate HEAD is not safe to push wholesale.** A clean allowlisted directory does not certify its repository history or remote access controls. Repository visibility, collaborators, prior downloads and exposure remain unverified because no remote metadata was accessed. Browser credential-bearing filenames create a potential security concern; contents were not read, so credential presence/exposure is not confirmed.

Separate approval is needed for repository access/exposure investigation, any credential/session remediation supported by evidence, private-file deletion, history rewriting, sanitized repository publication or Git pushes. Do not rotate credentials or destroy evidence automatically. Security review remains a release gate even though the local runtime candidate excludes the identified paths.

## Clean candidate, manifest and checksums

Location relative to the repository:

```text
release-candidates/districtline-2026-11-12T15-00-52-376Z
```

The absolute location and all 74 paths, byte sizes and SHA-256 checksums are recorded in [the manifest](districtline-clean-candidate-manifest.json). The manifest itself has SHA-256:

```text
cd17e60fdbeb43a9d178f57afd6fd75dff269978e5678b5401e02cfb00ebb6f5
```

Candidate verification confirms exact membership, source-byte equality, no symlinked source assets, hashes and relative import closure. No `.git`, node_modules, tests, reports, screenshots, personal images, uploads, credentials, environment files, databases or unapproved SQL were copied. The 74-file starting manifest was unchanged. Required public branding/font assets and license were retained. Existing dependencies outside the candidate were used only for the offline in-memory build; the source candidate contains no dependency installation or copied historical output. A fresh provider install is still necessary before a deployable package exists. Package test scripts reference excluded development files and are not deployment hooks.

Do not edit this candidate in place and continue using its old manifest. Source changes require a new allowlisted candidate, new hashes and affected checks. Preserve this directory for review; no archive or immutable Git commit was created.

## Remaining blockers and exact future release procedure

Pending gates: independently isolated PostgreSQL acceptance, functioning fresh-profile browser acceptance, remote project/deployment/config identity, native install and actual function tracing, approved server/browser flag/schema parity, repository exposure review and a compatible immutable rollback target. No paid resource or external action was taken to bypass them.

The next action is to establish a verified disposable synthetic database and a functioning isolated browser runner, execute the prepared suites and complete their uncovered acceptance cases. Obtain separately authorized metadata-only project/security review without exposing secret values. Do not deploy Preview yet.

For a future authorized operator targeting only the existing project:

1. In the owner's existing Vercel project serving `districtlinebooking.com`, record verified team/project ID, canonical domain association, current immutable production deployment ID and source SHA. Compare with the supplied baseline; stop on unexplained differences. Never create/import another project.
2. Record the existing effective root/install/build/output/region/Node settings and non-secret environment variable names/scopes/approved feature states. Do not print values. Confirm no accidental security or recovery activation and schema compatibility. No remote setting change is authorized here.
3. Review private Git exposure and source-upload method. Select only this reviewed clean candidate or a regenerated equivalent with verified hashes. Never deploy the full dirty checkout or existing HEAD/history. Resolve how the approved existing-project upload/build will receive the sanitized source before approval.
4. Independently verify Preview database, storage and delivery isolation: no production or protected backup connections, shared storage or real SMS/email. Existing project Preview defaults must not be assumed safe. Obtain separate approval for any needed configuration/resource changes.
5. Run real PostgreSQL suites and finish remaining catalog/rollback/permission cases above. Run fresh-profile browser acceptance at 320, 390, 768 and 1440 widths with synthetic fixtures: login/logout/session/error/loading; admin and staff navigation; Accounts View/Manage crew, revenue, expenses, duty create/adjust/delete/finalize/refresh/locked states; dashboard, customers, staff/trip management, seat selection, booking/cancellation. Check overflow, keyboard/focus/modal accessibility and console/network failures. Backend permission checks remain required independently of UI visibility.
6. After explicit Preview deployment approval, use the verified existing project and sanitized checksummed candidate with isolated Preview services. Perform a clean provider install/build; inspect Node/native sqlite3 compatibility and each function bundle for helper/CA/source presence, only approved SQL, and absence of all private paths and 008/009. Check actual rewrites/direct revenue route and assets. A local build is not a substitute.
7. Repeat isolated HTTP/browser/database acceptance on that immutable Preview deployment, including TLS, persistent session/cookie behavior, readiness failure handling, real uniqueness/concurrent conflicts and all financial persistence/locking/finalization. Record exact deployment ID, source digest and test results. No production transactions are part of acceptance.
8. Identify a previous known-good immutable deployment in the same existing project; verify access/eligibility, source/config/schema/storage compatibility, approved feature states and recovery behavior. Record current and rollback IDs. No ID is supplied or certified here.
9. Present the exact passing Preview deployment, candidate hashes, residual risks and rollback target for explicit production promotion approval. No promotion is permitted solely on this report's status.
10. After that approval only, deploy/promote the approved immutable release through the existing project's authorized procedure. Reconfirm production configuration compatibility without enabling new features or applying migrations. Preserve the prior deployment identity.
11. Monitor pre-agreed non-mutating checks: domain/TLS, static assets, `/api/health` and readiness/error rates/latency through approved telemetry. Do not create bookings, cancel, write finance, send messages or inspect customer records as smoke tests. Authenticated GETs may update session activity or reconcile full-dashboard duties; do not describe them as strictly read-only probes.
12. On agreed failure thresholds, use the preauthorized existing-project rollback procedure to restore the verified compatible deployment/alias; verify non-mutating health and report results. Rollback eligibility must be confirmed beforehand. Code rollback does not undo database/schema/storage/feature changes; do not run reverse SQL or restore protected data under this procedure.

## Final recommendation

**BLOCKED — EXTERNAL VERIFICATION REQUIRED.** The clean local candidate is reviewable and its stated offline checks pass. Database acceptance, browser acceptance, provider runtime verification, security exposure review and rollback verification remain incomplete. No Preview or Production readiness is claimed.

No deployment, Git mutation, protected database access, SQL/migration execution, environment/secret inspection, live transaction, delivery, dependency installation, paid resource, feature activation, archive/backup/private artifact modification or deletion occurred. Work stops after this report.
