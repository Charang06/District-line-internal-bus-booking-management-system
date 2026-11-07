# Migration 006 — consolidated remaining execution plan

This is the current plan for the remaining work. Earlier reports remain evidence; do not repeat completed reviews or unrelated test suites. No database connection, migration, permission change, activation or real email occurred during this TLS preparation stage. Public HTTPS was used only for official documentation/source and the public CA download.

## 1. TLS prepared locally

Inspected Node v24.11.0, pg v8.23.1 and the installed connection parser. The configured URLs have no SSL query overrides. No CA file, extra-CA setting or unsafe process override was configured. Node uses bundled public CAs by default; no Supabase root was found in the checked local/system stores. The earlier error proves an untrusted self-signed chain; its actual peer chain was not retained, so the precise remote issuer still requires the approved retry.

Downloaded the official Supabase root using verified public HTTPS:

`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`

Its provenance was confirmed against [Supabase Studio's certificate URL setting](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json), which uses that production download template. The shorter supabase.com certificate URLs tested returned 404 and were not used.

- Local file: `certs/supabase-prod-ca-2021.crt` (public certificate, no private key).
- Subject: Supabase Root 2021 CA; expires 26 April 2031.
- Pinned certificate DER SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
- Downloaded file SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
- `scripts/lib/supabase-verified-tls.cjs` checks the pin, CA status, self-signature and validity before building the TLS context.
- Uses explicit `ssl.ca` with TLS 1.2 minimum. Node's default chain and hostname verification remain enabled; no verification-switch override or custom identity callback is supplied.
- Explicit host/user/password/database fields prevent URL SSL parameters from replacing the configured CA. Unexpected URL options or custom NODE_OPTIONS fail closed.
- No Windows/global trust store or actual .env file was edited. The isolated integration helper uses this same verified TLS configuration. Existing application startup was not run.

Local validation: **13 focused tests passed**, no skips/failures, covering CA/context loading, expiry/pinning, pg configuration, unsafe URL rejection, standard hostname verification, zero-connection default invocation, isolation guards and the mocked route harness. Syntax/focused lint passed. No full-suite repetition was needed for this scoped tooling change. The previous full-suite result remains 77 passed / 5 intentionally skipped PostgreSQL tests.

Sources: [Supabase SSL enforcement and verify-full](https://supabase.com/docs/guides/platform/ssl-enforcement), [Supabase psql certificate setup](https://supabase.com/docs/guides/database/psql), [Node CA configuration](https://nodejs.org/api/tls.html#tlsgetcacertificatestype). This config authenticates the client-to-pooler connection; it does not independently prove every upstream/platform TLS setting.

## 2. Exact read-only retry — requires approval A

Safe local command already tested:

```
node scripts/migration006-readonly-preflight.cjs --check-local-tls
```

It does not load database credentials or open a connection. Importing the script likewise opens no connection.

After explicit approval for one read-only retry, use:

```
node scripts/migration006-readonly-preflight.cjs --approved-read-only-retry
```

The retry will:

1. Read existing local configuration privately. Check the source fingerprint is the approved `868295d24a51`, the restore fingerprint is `3ae16e4ead10`, and they differ. Never connect to the source.
2. Validate the CA pin and recovery archive integrity before connecting. Use the approved restore session-pool host on 5432, normal hostname verification, 15-second connect timeout and one connection attempt.
3. Request default read-only mode at startup and begin REPEATABLE READ READ ONLY. Verify authenticated TLS, expected database/session role and an already read-only active transaction first. Explicitly establish default-read-only/timeouts through SET LOCAL because startup settings may not survive the pooler, then recheck all final requirements. Use 5-second lock, 60-second statement and 10-minute transaction limits. Stop on uncertainty or any TLS failure; no alternate insecure route/retry.
4. SELECT migration versions, application catalog, table counts/checksums, default grants, four required roles/memberships and all sequence states. Compare with `diagnostic-NGHI2k/approved-target-after-state.json` and the verified 18-table/16-sequence recovery candidate.
5. ROLLBACK the read-only transaction and close the connection. Save private catalog/checksum results under the restricted existing backup directory. Console output excludes credentials and personal account rows.

No fixtures, DDL/DML, migrations, grants, cleanup, provider calls or PostgreSQL integration tests are in approval A. The user-facing result must distinguish a successful read-only inspection from authorization/readiness to write.

## 3. One recovery/baseline decision

The target recovery candidate is `test-2026-11-06-1312f8d1/database.dump`, SHA-256 `36edcc0507c23560931c6897b53245e0a719ec5db59c85273b8f46dd8ed41580`. It was previously application-restore verified, and local comparison matched the saved target's 18 tables and 16 sequences. The current source backup is different and must not replace it for target recovery.

- If the live application schema/data, owners/ACL/RLS/policies/defaults, required roles/memberships and sequences all match the captured target, retain that already-verified recovery candidate and the new read-only evidence. Do not repeat independent restoration just because the archive's clock age increased. A fresh target dump is optional additional protection, not a reason to repeat an unchanged restoration exercise.
- If relevant state differs, stop before writes. Prepare a fresh complete target dump from a consistent read-only snapshot, no-password role export and exact logical/security/sequence baseline. Validate checksum/TOC/extracts and independently restore-test the changed application baseline in an approved disposable destination. These additional remote operations need their own scope; no such test is automatic.
- Managed Supabase metadata, external Storage objects, role passwords and platform secrets are outside the proven application recovery image. Preserve managed schemas throughout; do not claim a whole-platform clone.
- A committed rehearsal is allowed only with a recovery baseline covering its exact mutation scope and exclusive use of the isolated target. Snapshot the original versions and all whitelisted sequence last_value/is_called values. Do not overwrite original target data as setup.

## 4. One bounded isolated rehearsal — requires approval B

Once A confirms identity and recovery state, obtain one explicit approval covering the applicable write/security rows below on named isolated targets. Routine synthetic fixture operations/cleanup within that approved recipe do not require repeated approvals. Stop only on scope changes, unexpected differences, unavailable recovery or failed postconditions.

### Target A: existing restore project

1. Confirm the SQL hashes once immediately before execution:
   - 005, if separately included as a prerequisite: `c5022498d0945d8d002c680827d5badb0766084eb09cd74adaa7a05f0e8f6a76`.
   - 006: `5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`.
   - 006 rollback: `5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b`.
2. Assess 005 from the single preflight. It is **not a direct SQL dependency of 006**; 006 requires users/schema_meta/identity from 001 and recovery_email from 004. Existing sessions/password recovery need 002/003. Forgot Username regression tests require 005. If missing and the approved rehearsal includes those regressions, include its exact forward/rollback as an explicit target-only prerequisite; otherwise stop that test subset rather than silently installing it. Do not reapply an installed migration.
3. Apply the unchanged reviewed 006 SQL once with stop-on-error handling, its 5-second lock and 30-second statement limits, and a bounded execution-session transaction timeout. Use TLS CA/hostname validation. For native PostgreSQL tools, use PGSSLMODE=verify-full and PGSSLROOTCERT pointing to the same pinned public CA. Credentials remain in child environment, never command arguments/logs. Keep source flags off.
4. Verify schema version, nullable timestamp with no backfill, dedicated tables/indexes/trigger, canonical/unique administrator email constraints, owner access and client-role denial. Never resolve an existing duplicate automatically. Record original account values using original columns/IDs so the added null column is not mistaken for account-data mutation.
5. Run the two username and two verification PostgreSQL integration tests serially with explicit target URL/fingerprint/write opt-in. They create only generated negative-ID synthetic accounts and exact-email fixtures. Delivery is injected/in-memory, and original accounts are never chosen as fallback. Test expiry, hashing, exact ID/email binding, single-use/concurrent redemption, email change-and-revert, cooldown/limits, staff/unauthenticated denial, and constraint rejection. Expected duplicate/canonical failures run in savepoints; constraints are never disabled to manufacture bad data.
6. Probe anon/authenticated permissions using transaction-local roles/rolled-back attempts. Check owner API access, RLS and table/column/sequence permissions without exposing existing account values. No persistent testing grants or new privileged roles.

The current helper deliberately requires versions 1–6 for the complete regression baseline. Tests do not migrate. All tests remain opt-in until approval B.

### Target B: separate empty booking application target, if still required

The booking/duty suite intentionally refuses a populated application database: production login can clean expired sessions and dashboard code can update duty state. Do not empty target A to satisfy that guard.

Provide a separately approved empty disposable Supabase project/branch and its expected fingerprint before this portion. Approve only schema/meta setup (versions 1–5, no source account/booking data), exact migration 006, synthetic fixtures, security checks and its defined teardown/recovery. Original target-B state must be captured first; retaining a prepared empty baseline or retiring a disposable project requires the owner's explicit chosen scope, not automatic project deletion.

Run the cookie-based booking/duty test with `--experimental-vm-modules` and serial test execution. The test-only loader uses unchanged production route definitions with startup migration/seeding/listening suppressed, isolated PostgreSQL injected, and mail/SMS/storage network operations mocked/blocked. Existing production source is not rewritten. The test covers synthetic admin/staff cookie login, booking revenue/expenses separation, finalization and frozen reports. It does not log in as any restored administrator/staff account.

This target is not needed to establish 006's direct DDL dependencies. It is needed for the full booking regression scope without risking populated data. Approval B may stage this separate target without rerunning target A's successful tests.

### Every database write/security change to authorize

| ID | Isolated action | Database/security effect |
| --- | --- | --- |
| W1 | Optional 005 prerequisite on A | Creates username token/limit tables, indexes, sequence, trigger/function, RLS/client revocations and version 5. No existing account-value update. Only if absent and explicitly approved. |
| W2 | Exact 006 on A (and approved B) | Adds nullable users timestamp, canonical check/unique index, verification tables/sequence/indexes/trigger/function and version 6; enables users/new-table RLS; revokes PUBLIC/anon/authenticated access to those tables and relevant sequences. Owner/service access preserved. |
| W3 | Synthetic integration operations | INSERT/UPDATE/DELETE only registered fixture users/tokens/limits/sessions/audit rows and, on B, synthetic buses/trips/bookings/finances. No original record or recovery link is used. Sequence advances are tracked. |
| W4 | Optional empty B setup | Explicitly approved schema/meta DDL and baseline metadata only, plus migration 006; no data copied from original accounts/bookings. No unapproved 005/006 execution or grants outside B. |
| W5 | Fixture cleanup and exact 006 rollback | Deletes only guarded synthetic rows, then removes 006 objects/timestamp/version. New verification history is lost; preserve sanitized diagnostics first. Rollback deliberately retains users hardening. |
| W6 | Optional 005 rollback | Only if W1 introduced it on a baseline lacking 005 and its removal was approved. Never drop pre-existing username recovery objects/data. |
| W7 | Restore prior isolated security/sequence state | Snapshot-derived restoration of changed users-table/sequence grants and RLS/FORCE RLS, plus only changed original sequence states. Reopening broad client grants is a separately acknowledged security downgrade on the isolated target; never on source. |
| W8 | Emergency target application recovery | Not automatic: exact baseline application restore/overwrite only under an explicit recovery scope. Preserve managed schemas/platform roles. Project deletion is excluded. |

Read-only backup/export writes only local files, not database rows; it is distinct from the W operations. Any independent restore verification writes its disposable destination and therefore needs that destination included in approval.

## 5. Committed rollback and exact restoration

1. Drain and close only the rehearsal harness; keep all source flags off. Preserve private diagnostics. Clean guarded synthetic rows in FK-safe order; no broad deletion, TRUNCATE or source access.
2. Execute the exact reviewed 006 rollback on the target. If W1 was introduced and W6 approved, roll back only that added 005 layer. Check object/version removal and preservation of original account/booking values.
3. The 006 rollback retains security hardening. If the approved captured target baseline has users RLS off and anon/authenticated grants, restore exactly those changed settings through the approved W7 script. Preserve owners/service grants/defaults/role memberships; do not rewrite unchanged properties. Confirm target ID before any recovery SQL. No source grants are changed.
4. Under exclusive use with no remaining writers, compare sequences first. Restore only changed, baseline-whitelisted values using the captured last_value/is_called, never MAX(id). setval is not transactionally reversible; verify each result and stop/report failures rather than retry blindly.
5. Strictly compare original row checksums/counts, logical schema, owner/ACL/RLS/policies/defaults, required roles/memberships and all original sequence states. Managed inventory must be unchanged. No unexplained drift is accepted. Feature rollback alone does not establish exact target recovery.
6. If recovery fails, stop and preserve evidence. W8 is a separately reviewed fallback, not permission to overwrite/merge records automatically. No migration or feature activation on the source follows automatically from a rehearsal PASS.

## 6. What is ready versus pending

Ready locally: pinned official CA, fail-closed TLS helper shared by the read-only retry and isolated integrations, safe default/local-check command, explicit retry command, 13 focused local tests, previously completed application/tests and immutable reviewed SQL, and this one consolidated plan.

Approval A completed in the diagnostic retry below. Verified client TLS and the current application recovery baseline passed; no further read-only retry is needed without relevant drift.

Approval B's restore-project 005/006 recovery rehearsal completed successfully below. Separate empty booking-target provisioning/testing remains deferred; no populated-target booking run was authorized. W8 was not used. Source migration and activation remain excluded pending final approval.

Still excluded: original/source writes, production operations, real email, source migration 006 and verification activation. Those require separate explicit approval after rehearsal evidence. Do not rerun broad local reviews or past successful restoration checks unless a relevant change/failure justifies it.

## Completed diagnostic preflight — 7 November 2026

The original saved failure lacked individual guard values. Local correction added a tested guard module with initial/final diagnostics. The single approved retry reproduced exactly one initial failure: `sessionDefaultReadOnly=false` / `default_transaction_read_only=off`; identity, active transaction read-only mode, encrypted TLS and certificate authorization all passed. Startup options had not established the expected server default. The script now verifies the protected transaction/identity first, sets the same requirements transaction-locally, then requires every final check to pass. No check was dropped or allowed to remain false.

Focused guard/TLS tests: **11 passed, 0 failed**. Wrong role/database, writable transactions, unverified/unencrypted TLS, ignored settings and final regressions all fail closed before application inspection. No remote operation occurred during local investigation.

One approved remote connection then completed in about 10 seconds. Result: **PASS**, source never connected, database writes/migrations/integration tests/emails all zero. Server PostgreSQL 17.11; migration versions 1–4; 005 and 006 absent. All 18 application-table counts/checksums, 16 sequence states, captured schema/ACL/RLS/policies/defaults and required roles/memberships match. Archive checksum remains valid; archive age at audit about 12.5 hours. Existing verified application recovery candidate remains sufficient for this unchanged scope; a new target dump or independent application restore retest is not required solely due to age.

Target is populated, so the booking/duty harness must use a separately approved empty application target. Current target can support the four recovery integration tests after explicitly approved 005/006 installation and scope W1–W3/W5–W7 recovery. Rollback must remove only newly introduced 005/006 layers, restore captured prior isolated grants/RLS and any changed original sequence states, then compare the baseline strictly. No original/source account is a fixture.

Private evidence: `diagnostic-NGHI2k/readonly-preflight-c1NlwA/preflight-report.json` and `live-target-state.json` under the secure existing backup directory. Approval B is still pending; no migration or activation followed this PASS.

## Completed approved 005/006 rehearsal — PASS, 7 November 2026

Exactly one approved rehearsal ran on restore project fingerprint `3ae16e4ead10`. The source project was never connected. TLS/identity, reviewed SQL hashes and unchanged 18-table/16-sequence recovery baseline were reconfirmed before writes. No migration SQL was edited, original account/booking values were changed, booking tests run, real email sent or actual verification flag enabled.

Migration 005: **PASS**. Migration 006: **PASS**. Both committed successfully only on the isolated target. Original-record checksums were verified between stages, projecting out the newly added nullable users column while 006 existed.

Security checks passed: RLS/owner state on five tables; ten client table/column grant checks; sequence-access checks; six real transaction-local client-role denial probes; canonical constraint validation; valid unique index; no verification backfill; retained owner/service access. Probes selected zero rows or attempted zero-row updates and were rolled back. No existing target record was used as a test fixture.

| Actual PostgreSQL integration test | Result |
| --- | --- |
| Recovery email: expiry, constraints, email-change trigger, limits and permissions | PASS |
| Recovery email: concurrent redemption on synthetic administrator | PASS |
| Forgot Username: expiry, limits, permissions and account-change trigger | PASS |
| Forgot Username: concurrent redemption on synthetic administrator | PASS |

**4 passed, 0 failed, 0 skipped.** Delivery was injected/mocked and fixtures used generated IDs/canonical example.test emails. Booking tests were excluded. Test environments did not receive source URLs or provider credentials. Because the pooler had ignored startup settings, the test-only pool helper was locally adjusted to apply bounded timeouts on each acquired session; nine focused preparation tests passed before the authorized run. Production application code was not changed by that adjustment.

Rollback 006: **PASS**, followed by rollback 005: **PASS**. The explicitly authorized prior users-table/sequence client grants and users RLS setting were restored only on the isolated target. All 16 original sequence values/is_called states remained unchanged, so **zero sequence resets** were necessary. No full-database restore or destructive retry occurred.

Exact recovery comparison: **PASS**. Original logical application schema, all 18 table row counts/checksums, owner/grants/RLS/policies/default privileges, all captured role attributes/memberships (including grantors), namespace owner/ACL state, migration versions 1–4 and all 16 sequences match the captured pre-test state. No 005/006 objects or version markers remain on the restore target. Transient session diagnostics were excluded from logical-state equality; each final security/read-only guard still passed.

Private evidence folder: `diagnostic-NGHI2k/approved-isolated-rehearsal-kVtqOT` under the restricted backup directory. Includes `rehearsal-report.json`, `baseline-before.json`, `baseline-after.json`, `security-checks.json`, `integration-results.json`, private test logs and captured security-recovery SQL. ACL inspection confirmed current-user/SYSTEM-only access.

Remaining scope: source preconditions/migration 006 and any activation need separate final approval. Real email delivery has not been exercised. Full booking/duty regression is deferred to an explicitly approved empty application target. This PASS verifies the four authorized recovery integration tests and committed migration/rollback/recovery, not a full Supabase platform restore or unrun booking/login/password-reset end-to-end scenarios.
