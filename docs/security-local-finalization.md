# Local security finalization — 2026-11-09, Asia/Colombo

All safe local preparation is finished to the extent available without an isolated
database or owner/provider access. No production deployment, migration, SSL setting,
restart, role/grant, financial record or scheduled job was changed. Migration 007
and existing UI/business code are unchanged in this pass. The populated restore
database was not used. No age private identity was read or modified.

## Results

| Area | Local result | Production status |
| --- | --- | --- |
| Admin/staff authentication | PASS: actual route definitions with synthetic SQL fixtures | Activation still requires approvals and isolated SQL checks |
| Account/IP/pair limiter | PASS: persistence logic, account/IP rotation, shared-IP isolation, 429, Retry-After, cooldown and store failure | Disabled; migration 008 not applied |
| MFA | PASS: RFC vectors, enrollment/proof/expiry, encrypted seed binding, replay, failures/cooldown, recovery single-use/rotation, session revocation/transaction rollback | Mode off; migration 009/enrollment/enforcement not activated |
| Password recovery | PASS: new real-route/mock-store test for generic known/unknown/staff response, cooldown, expiry, single use, session revocation, password replacement and MFA preservation | No real mail or account changes |
| Username recovery | PASS: existing service/router tests for generic responses, tokens, expiry, limits, role checks and unchanged passwords/sessions | Existing configuration unchanged |
| Booking/cargo | PASS: synthetic browser validation errors, selected-seat submission and cargo submission | No production booking/cargo requests |
| Trip Controls | PASS: date/bus/route/trip combinations, reset, older-date query, failed query/retry | Existing implementation unchanged |
| Add Bus/Bus No | PASS: registration/cache refresh, failed registration, staff dropdown refresh/deduplication and chosen-ID edit | Synthetic browser only |
| Mobile | PASS: sign-in, booking/form bounds and navigation at 360/390/768/1440 widths; MFA challenge at 390 | Representative synthetic browser checks, not every device |
| Finance | Owner production verification PENDING | Unsafe unscoped dashboard GET explicitly blocked from checklist |
| Five isolated PostgreSQL checks | BLOCKED, by owner instruction | No safe empty database; no safety gate bypass |

Final Node suite: **116 tests; 111 passed, zero failed, five blocked/skipped**.
All **22 current-UI synthetic browser checks pass**. The browser harness initially failed
because an inherited mock regex lost escaping inside the injected template; a later
seat assertion assumed seat 01 was first in DOM order. Both harness errors were
corrected. No product changes were needed. Initial failing attempts are not counted
as passing evidence.

The browser serves only built static files on loopback, refuses all real /api and
/uploads requests, injects synthetic API responses and blocks page requests outside
the loopback origin. It uses a separate temporary Chrome profile and closes that
browser after the run. No personal browser profile, production account or finance data
was used. Screenshots contain synthetic state. External fonts/assets may be blocked;
the viewport assertions do not replace owner verification on actual mobile devices.

Reproduce with `npm.cmd test`, `npm.cmd run build`, then
`npm.cmd run test:browser:security`. The last command needs locally installed Chrome
and permission to launch a local browser/listener. SECURITY_TEST_CHROME can select a
different Chrome executable. The harness reuses current-UI cases from the existing
artifacts/ui-refresh-review/browser-check.cjs; include that fixture when reproducing.

## TLS review and provider confirmation

The existing runtime candidate parses discrete pg fields, preserves pooler host/port,
loads the pinned Supabase CA, requires certificate-chain/hostname verification and
TLS >=1.2, and rejects remote plaintext or a process-wide verification bypass. Its
local trust/hostname tests pass. The earlier read-only source diagnostic on this date
recorded client TLSv1.3/authorized=true and backend pg_stat_ssl.ssl=false. No repeat
database inspection or production startup was needed in this pass.

Supabase's public documentation confirms enforcement covers both shared-pooler legs
and changing it restarts the database. It does not publicly establish the hosted
project's upstream certificate/hostname verification configuration. Current public
Supavisor source has a peer-verification option and a custom matcher returning true;
it also supports a verification-none option. This source is not proof of the hosted
revision or configuration. Therefore hosted upstream identity verification remains
**unconfirmed**, not silently accepted as verify-full.

Prepared owner support question, not sent: “For our hosted shared pooler in session
and transaction modes, confirm the deployed upstream TLS verification mode, trusted
CA, and how the database server identity is validated. Does hostname/SAN validation
occur, or is identity bound another way? Does enabling SSL enforcement change peer
verification as well as encryption? Please confirm against our project's current
deployment.” Add project identification only through the owner's trusted support UI.

Sources: [SSL enforcement and restart](https://supabase.com/docs/guides/platform/ssl-enforcement),
[public Supavisor TLS code](https://github.com/supabase/supavisor/blob/main/lib/supavisor/db_handler.ex).

## Proposed TLS maintenance and rollback

Proposed reservation: **13:30–14:00 Asia/Colombo (08:00–08:30 UTC) on an owner-selected
date**, pending confirmation that this is a quiet operating period. This is not booked
or approved. Reserve 30 minutes; actual restart duration is provider-dependent.

1. Before approval: inventory all clients, verify CA/hostname config and reconnect
   behavior, preserve current requested/applied enforcement state and reviewed app
   release, and ensure a working owner database/dashboard access path. Existing verified
   encrypted backup evidence remains available; no new R2 backup is required for local
   TLS preparation. Real isolated application checks remain a rollout prerequisite.
2. Obtain **separate explicit SSL-enforcement/restart approval**, naming the project,
   window, observed backend plaintext, expected interruption and contingency. The
   owner coordinates quiet traffic and prevents financial/report actions during it.
3. Read requested/applied enforcement through the dashboard. If already enabled, do
   not toggle blindly; escalate the discrepancy. Otherwise use the reviewed Supabase
   dashboard setting once, wait for restart and requested/applied convergence.
4. On fresh connections run `node scripts/security/transport-preflight.mjs --read-only`.
   Require applicationTlsVerified=true and backendTlsEncrypted=true. Repeat with new
   connections to detect stale backends. This SQL check proves backend encryption, not
   provider certificate/hostname verification. Resolve the provider question separately.
5. The owner checks existing admin/staff login and session recovery. Booking/finance
   mutation regressions remain synthetic/isolated; production finance browser checks
   follow the guarded checklist only. Check HTTP/database errors privately; no secrets
   or customer data should be copied into results.
6. Abort before the setting change if prerequisites fail. Afterward, prefer correcting
   CA packaging/client configuration or engaging Supabase while maintaining maintenance
   mode. Never set rejectUnauthorized=false, disable hostname checking or use remote
   DATABASE_SSL=disable. A return to the old enforcement setting would reintroduce the
   known risk and may restart again; it requires a **new explicit incident approval**,
   not automatic rollback. A direct verified connection is an alternative only after
   reachability, connection-budget and any cost changes are separately reviewed.

Application TLS deployment has its own approval: validate CA/helper files in the
Vercel bundle, retain the current connection method, keep both auth features off,
deploy only the reviewed change set, then check connection and owner sign-in. Do
not roll back to an older release with the insecure certificate bypass; prepare a
TLS-verified rollback release or fix forward. No deployment was performed here.

## Limiter activation and rollback

The limiter uses one atomic PostgreSQL UPSERT across account, IP and account/IP
keys with database-clock fixed windows; it does not rely on serverless memory. The
existing Vercel ingress trust-proxy setting is one hop; extra upstream proxies need
review. IPv6 keys aggregate /64. HMAC keys avoid storing raw usernames/IP addresses.
Account privacy uses generic credential failures; no user lookup is performed by
the limiter. Existing bcrypt cost differences are not a guarantee of identical timing.

Current thresholds are 8 account/IP, 15 account across IPs, 300 IP across accounts
per 15 minutes, including successes. Another staff account on a limited account's IP
passes local HTTP checks, and cooldown does not extend indefinitely with each attempt.
These are conservative starting values; owner-confirm expected office/mobile-network
volume and monitor sanitized 429 counts before changing thresholds. Do not add a
shared-office unconditional bypass. Store failures return 503 rather than silently
disabling protection. Password/username recovery retain independent limits.

Migration candidate: `server/migrations/008_login_rate_limits.sql`, still outside
startup migration registration. It creates only the new protected table/index,
enables RLS and revokes PUBLIC/anon/authenticated grants. It does not rerun 007 or
modify existing records. Test it on a safe disposable target first, including actual
atomic concurrency and effective runtime/browser privileges. That is blocked today.

Approval sequence: isolated checks → separate 008 approval → code deployment approval
with ENABLE_LOGIN_RATE_LIMIT=false → private LOGIN_RATE_LIMIT_KEY setup → separate
activation approval → enable and observe normal owner sign-in/429 rates. R2 credentials
are not a prerequisite. Approve bounded expired-row cleanup separately; no cleanup
schedule is active. On incident, turning the flag false removes new protection and
requires a separate rollback decision; preserve existing recovery limits and the
protected table for investigation. Do not delete tables or weaken grants as rollback.

## MFA enrollment, enforcement and recovery

Migration candidate: `server/migrations/009_admin_mfa.sql`, manual-only and not applied.
It adds the protected encrypted-state table and nullable session verification marker.
It does not update existing users or sessions. Existing session timeouts remain in use.
The backend remains ADMIN_MFA_MODE=off; the enrollment build flag remains false.

1. Rehearse 009, transaction rollback/concurrency and complete browser enrollment on
   a safe empty target. Separately approve the migration and deployment while off.
2. Establish ADMIN_MFA_ENCRYPTION_KEY custody: base64 of 32 random bytes, server-only,
   with a protected independent recovery copy. Do not replace it without a reviewed
   seed re-encryption plan. It is separate from the age identity and R2 credentials.
3. Obtain separate enrollment-stage approval for mode=enroll and the frontend build
   flag. Existing administrators sign in normally, confirm their current password,
   add the displayed private seed to an authenticator and prove a code within ten
   minutes. Confirmation revokes existing sessions and shows ten high-entropy recovery
   codes once. Save offline before closing the profile or reloading.
4. For response loss, sign in during enrollment and use the working authenticator
   plus current password to replace recovery codes. Replacement invalidates old codes
   and sessions. Verify recovery handling with synthetic fixtures and owner custody;
   do not consume production recovery codes as an unapproved test.
5. Inventory every active administrator and a second enrolled owner-controlled admin.
   Obtain **separate mandatory-enforcement approval** only after enrollment/recovery
   verification and persistent login protection pass. Existing unverified admin
   sessions are then denied. Password proof creates only a five-minute challenge;
   MFA success consumes it and creates the verified session in one locked transaction.
   Staff login stays unchanged. Five failed MFA attempts trigger an account cooldown.
6. Recovery uses password proof plus one unused recovery code, revokes old sessions
   and creates one verified session. Password-reset emails do not clear MFA or bypass
   it. If all factors are lost, use owner identity verification out of band and a
   separately approved targeted reset/re-enrollment plan—no email-only reset endpoint
   or global mode=off shortcut. There is no unauthenticated factor-disable route.
7. Before enforcement, cancel rollout safely by keeping mode=off/enroll and preserving
   enrolled state. After enforcement, relaxing policy is a separate incident approval.
   Prefer fixing key/config/clock issues or an approved compatible application release.
   Preserve MFA state/verification columns and never revert to code that silently
   ignores enforced MFA. SQL drops and global policy weakening are not preauthorized.

## Finance status

Follow `docs/finance-owner-verification.md`. A newly explicit guard is mandatory before
navigation: unscoped/full GET /api/admin/dashboard can UPDATE duty statuses through
getAdminDutyData(). The safe accounts/dashboard scoped branches return before it.
The existing refreshAccountsData callback can request the unscoped route, so a button
label or GET method is not sufficient evidence of safety. Do not change that unrelated
business behavior in this security pass. Without reliable owner-controlled interception,
mark the affected production check BLOCKED rather than testing it.

Revenue/Accounts, Daily Expenses, Expense Submissions, filters and reports remain
PENDING for owner production verification. Record only area, viewport, date/time,
deployed commit, PASS/FAIL/PENDING/BLOCKED and sanitized error/status. Never create,
edit, approve, delete or finalize finance records to complete this checklist.

## Backups — R2 selected, deferred independently

Cloudflare R2 supersedes the prior B2 recommendation. No B2 configuration will be
performed. Existing encrypted backup code/templates are preserved, no keys requested,
and no upload, monitoring ping, lifecycle change or schedule activation occurred.
BACKUPS_APPROVED stays false/absent. The workflow remains outside .github/workflows
with its cron commented. There is no backup dependency blocking local auth/TLS work.

Later backup-only gates: owner-created private R2 bucket/region/endpoint and restricted
credentials; review R2 token capabilities versus the intended Put/Get/no-delete scope;
review 30-day lifecycle/immutability behavior; dedicated database-role/RLS completeness
and backend-TLS audit; independent success/failure monitor and missed-run evidence;
one approved encrypted upload/download verification and isolated offline restore.
Only then request separate daily-schedule approval. The age public recipient is reused;
the private identity remains offline and unchanged. No current R2 bill is incurred.

## Exact files changed in this pass

- `package.json`: local synthetic browser test command.
- `scripts/security/browser-local.cjs`: loopback static server, isolated Chrome and
  current-UI/synthetic mobile/business/MFA browser checks; no production backend.
- `server/security-http.test.js`: dedicated password-recovery HTTP regression case.
- `server/test-support/password-recovery-local-worker.mjs`: synthetic token/session/
  email fixtures for the actual recovery routes.
- `docs/finance-owner-verification.md`: pre-navigation deny rules, known writing GET
  route and explicit pending production results.
- `docs/security-continuation-readiness.md`: pointer to this finalization and R2 choice.
- `ops/backups/README.md`: R2 selected/deferred notice; implementation preserved.
- `docs/security-local-finalization.md`: this report, approval and rollback procedures.
- `artifacts/security-local/browser-results.json`, `login-mobile.png`,
  `booking-mobile.png`: synthetic evidence only.

## Remaining production blockers

No disposable database for the five existing integration tests or 008/009 real SQL
rehearsals; hosted upstream certificate/identity behavior not confirmed by Supabase;
SSL maintenance/restart and application deployment approvals absent; owner finance
browser verification pending; administrator enrollment/key custody/recovery evidence
and separate limiter/MFA activation approvals outstanding. R2 setup is deferred and
is a blocker only for future backups, not for these independent security changes.

Final checks: frontend build passed; repository lint exited successfully with existing
warnings; targeted lint of the new/changed test files had no findings; git diff --check
passed. No CSS or product behavior was changed in this pass. The earlier prepared
runtime/migration candidates remain reviewable and inactive.
